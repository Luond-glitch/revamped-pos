import uuid
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum

from sales.models import Sale
from .models import Payment


ZERO = Decimal("0.00")

ALLOWED_METHODS = {
    "cash",
    "mobile_money",
    "card",
    "bank_transfer",
}


def _to_money(value):
    """Convert an amount to Decimal and reject invalid values."""
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError("Enter a valid payment amount.")

    if not amount.is_finite():
        raise ValidationError("The payment amount must be finite.")

    return amount.quantize(Decimal("0.01"))


def _existing_payment(idempotency_key):
    if idempotency_key is None:
        return None

    return Payment.objects.filter(
        idempotency_key=idempotency_key
    ).first()


@transaction.atomic
def record_payment(
    *,
    sale_id,
    business,
    received_by,
    amount,
    payment_method,
    transaction_reference="",
    notes="",
    idempotency_key=None,
):
    """
    Record a payment against a completed sale.

    Repeated requests with the same idempotency key and identical
    details return the original payment.
    """
    payment_amount = _to_money(amount)

    if payment_amount <= ZERO:
        raise ValidationError(
            "Payment amount must be greater than zero."
        )

    if payment_method not in ALLOWED_METHODS:
        raise ValidationError("Choose a supported payment method.")

    if idempotency_key is not None:
        try:
            idempotency_key = uuid.UUID(str(idempotency_key))
        except (TypeError, ValueError, AttributeError):
            raise ValidationError("A valid idempotency key is required.")

        existing = _existing_payment(idempotency_key)

        if existing is not None:
            same_request = (
                existing.business_id == business.pk
                and existing.sale_id == sale_id
                and existing.amount == payment_amount
                and existing.payment_method == payment_method
                and existing.transaction_reference == transaction_reference
                and existing.notes == notes
                and existing.received_by_id == getattr(received_by, "pk", None)
            )

            if same_request:
                return existing

            raise ValidationError(
                "This idempotency key has already been used "
                "for a different payment request."
            )

    sale = (
        Sale.objects
        .select_for_update()
        .filter(pk=sale_id, business=business)
        .first()
    )

    if sale is None:
        raise ValidationError("Sale not found for this business.")

    if sale.status != "completed":
        raise ValidationError(
            "Payments can only be recorded for completed sales."
        )

    sale_total = _to_money(sale.total_amount)

    if sale_total <= ZERO:
        raise ValidationError("The sale must have a positive total.")

    previous_payments = Payment.objects.filter(
        sale=sale,
        status="completed",
    ).aggregate(total=Sum("amount"))["total"]

    paid_so_far = _to_money(previous_payments or ZERO)
    outstanding = sale_total - paid_so_far

    if outstanding <= ZERO:
        raise ValidationError("This sale has already been fully paid.")

    if payment_amount > outstanding:
        raise ValidationError(
            f"Payment exceeds the outstanding balance of {outstanding}."
        )

    try:
        # The inner atomic block creates a savepoint. This allows us
        # to recover safely if another request inserts the same key.
        with transaction.atomic():
            payment = Payment.objects.create(
                business=business,
                sale=sale,
                amount=payment_amount,
                payment_method=payment_method,
                status="completed",
                transaction_reference=transaction_reference,
                received_by=received_by,
                notes=notes,
                idempotency_key=idempotency_key,
            )
    except IntegrityError:
        if idempotency_key is None:
            raise

        existing = _existing_payment(idempotency_key)

        if existing is None:
            raise

        same_request = (
            existing.business_id == business.pk
            and existing.sale_id == sale_id
            and existing.amount == payment_amount
            and existing.payment_method == payment_method
            and existing.transaction_reference == transaction_reference
            and existing.notes == notes
            and existing.received_by_id == getattr(received_by, "pk", None)
        )

        if same_request:
            return existing

        raise ValidationError(
            "This idempotency key has already been used "
            "for a different payment request."
        )

    new_paid_total = paid_so_far + payment_amount
    remaining_balance = sale_total - new_paid_total

    sale_field_names = {
        field.name
        for field in Sale._meta.get_fields()
        if hasattr(field, "name")
    }

    if "payment_status" in sale_field_names:
        if remaining_balance == ZERO:
            sale.payment_status = "paid"
        elif new_paid_total > ZERO:
            sale.payment_status = "partially_paid"
        else:
            sale.payment_status = "unpaid"

        sale.save(update_fields=["payment_status"])

    return payment
