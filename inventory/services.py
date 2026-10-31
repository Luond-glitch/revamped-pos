from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import Stock, StockMovement


MANUAL_MOVEMENT_TYPES = {
    "receipt",
    "return",
    "adjustment",
    "transfer_in",
    "transfer_out",
}


@transaction.atomic
def record_stock_movement(
    *,
    stock_id,
    movement_type,
    quantity_change,
    reference="",
    notes="",
):
    """
    Record a stock change and update the stock quantity atomically.

    quantity_change:
        Positive = stock increases.
        Negative = stock decreases.
    """
    if movement_type not in MANUAL_MOVEMENT_TYPES:
        raise ValidationError(
            "This movement type cannot be recorded manually."
        )

    try:
        quantity_change = Decimal(str(quantity_change))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValidationError("Enter a valid quantity.") from exc

    if not quantity_change.is_finite():
        raise ValidationError("Quantity must be a finite number.")

    if quantity_change == 0:
        raise ValidationError("Quantity change cannot be zero.")

    if movement_type in {"receipt", "return", "transfer_in"}:
        if quantity_change < 0:
            raise ValidationError(
                "This movement type requires a positive quantity."
            )

    if movement_type == "transfer_out" and quantity_change > 0:
        raise ValidationError(
            "A transfer out requires a negative quantity."
        )

    stock = Stock.objects.select_for_update().get(pk=stock_id)

    new_quantity = stock.quantity + quantity_change

    if new_quantity < 0:
        raise ValidationError(
            "Insufficient stock. The resulting quantity cannot be negative."
        )

    stock.quantity = new_quantity
    stock.save(update_fields=["quantity", "updated_at"])

    movement = StockMovement.objects.create(
        stock=stock,
        movement_type=movement_type,
        quantity_change=quantity_change,
        reference=reference,
        notes=notes,
    )

    return stock, movement
