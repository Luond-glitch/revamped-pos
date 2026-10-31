import hashlib
import json
import uuid
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from businesses.models import Branch
from inventory.models import Product, Stock, StockMovement
from .models import Sale, SaleItem


ZERO = Decimal("0.00")


def money(value, field_name="Amount"):
    """Convert a value to a valid two-decimal monetary amount."""
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValidationError(f"{field_name} must be a valid amount.")

    if not result.is_finite():
        raise ValidationError(f"{field_name} must be a finite amount.")

    if result < ZERO:
        raise ValidationError(f"{field_name} cannot be negative.")

    return result.quantize(Decimal("0.01"))


def build_checkout_fingerprint(
    *,
    business,
    branch,
    items,
    customer_id=None,
    discount_amount=ZERO,
    tax_amount=ZERO,
    notes="",
):
    """
    Hash the checkout details so a checkout key cannot be reused
    for a different basket.
    """
    normalized_items = sorted(
        [
            {
                "product_id": str(item["product_id"]),
                "quantity": str(Decimal(str(item["quantity"]))),
            }
            for item in items
        ],
        key=lambda item: item["product_id"],
    )

    payload = {
        "business_id": str(business.pk),
        "branch_id": str(branch.pk),
        "customer_id": str(customer_id) if customer_id else None,
        "items": normalized_items,
        "discount_amount": str(money(discount_amount)),
        "tax_amount": str(money(tax_amount)),
        "notes": notes or "",
    }

    serialized = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _existing_checkout(checkout_key, payload_hash):
    """Return an existing sale for a matching checkout key."""
    sale = Sale.objects.filter(checkout_key=checkout_key).first()

    if sale is None:
        return None

    if sale.checkout_payload_hash != payload_hash:
        raise ValidationError(
            "This checkout key has already been used for different sale details. "
            "Start a new checkout."
        )

    return sale


@transaction.atomic
def process_sale(
    *,
    business,
    branch,
    cashier,
    items,
    customer_id=None,
    discount_amount=ZERO,
    tax_amount=ZERO,
    notes="",
    checkout_key=None,
    checkout_payload_hash=None,
):
    """
    Create a sale, deduct stock and record stock movements atomically.

    Repeated requests using the same checkout key and payload return
    the existing sale instead of creating another sale.
    """
    if checkout_key is None:
        checkout_key = uuid.uuid4()

    try:
        checkout_key = uuid.UUID(str(checkout_key))
    except (TypeError, ValueError, AttributeError):
        raise ValidationError("A valid checkout key is required.")

    discount_amount = money(discount_amount, "Discount")
    tax_amount = money(tax_amount, "Tax")

    if not business.is_active:
        raise ValidationError("This business is inactive.")

    if not branch.is_active or branch.business_id != business.pk:
        raise ValidationError(
            "Select an active branch belonging to this business."
        )

    if not items:
        raise ValidationError("A sale must contain at least one item.")

    product_ids = [str(item["product_id"]) for item in items]

    if len(product_ids) != len(set(product_ids)):
        raise ValidationError(
            "Each product should appear only once in the checkout basket."
        )

    payload_hash = checkout_payload_hash or build_checkout_fingerprint(
        business=business,
        branch=branch,
        items=items,
        customer_id=customer_id,
        discount_amount=discount_amount,
        tax_amount=tax_amount,
        notes=notes,
    )

    # Fast path: an identical request has already completed.
    existing = _existing_checkout(checkout_key, payload_hash)
    if existing is not None:
        return existing

    # Resolve products within this business.
    products = {
        str(product.pk): product
        for product in Product.objects.filter(
            pk__in=product_ids,
            business=business,
            is_active=True,
        )
    }

    if len(products) != len(product_ids):
        raise ValidationError(
            "One or more products are invalid, inactive, or belong to another business."
        )

    quantities = {}

    for item in items:
        product_id = str(item["product_id"])

        try:
            quantity = Decimal(str(item["quantity"]))
        except (InvalidOperation, TypeError, ValueError):
            raise ValidationError("Each item must have a valid quantity.")

        if not quantity.is_finite() or quantity <= 0:
            raise ValidationError("Item quantities must be greater than zero.")

        quantities[product_id] = quantity

    # Lock the relevant stock rows while validating and deducting stock.
    stocks = list(
        Stock.objects.select_for_update()
        .filter(
            branch=branch,
            product_id__in=[products[key].pk for key in product_ids],
        )
        .order_by("product_id")
    )

    stocks_by_product = {
        str(stock.product_id): stock
        for stock in stocks
    }

    subtotal = ZERO

    for product_id in product_ids:
        product = products[product_id]
        quantity = quantities[product_id]
        stock = stocks_by_product.get(product_id)

        if stock is None:
            raise ValidationError(
                f"No stock record exists for {product.name} at this branch."
            )

        if stock.quantity < quantity:
            raise ValidationError(
                f"Insufficient stock for {product.name}. "
                f"Available: {stock.quantity}; requested: {quantity}."
            )

        subtotal += money(product.selling_price, "Product price") * quantity

    subtotal = subtotal.quantize(Decimal("0.01"))
    total_amount = subtotal - discount_amount + tax_amount

    if total_amount < ZERO:
        raise ValidationError("The sale total cannot be negative.")

    # Create the sale and all its effects in the same transaction.
    try:
        with transaction.atomic():
            sale_kwargs = {
                "business": business,
                "branch": branch,
                "cashier": cashier,
                "status": "completed",
                "subtotal": subtotal,
                "discount_amount": discount_amount,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
                "checkout_key": checkout_key,
                "checkout_payload_hash": payload_hash,
            }

            if customer_id is not None and any(
                field.name == "customer"
                for field in Sale._meta.get_fields()
                if hasattr(field, "name")
            ):
                sale_kwargs["customer_id"] = customer_id

            if any(
                field.name == "notes"
                for field in Sale._meta.get_fields()
                if hasattr(field, "name")
            ):
                sale_kwargs["notes"] = notes or ""

            if any(
                field.name == "receipt_number"
                for field in Sale._meta.get_fields()
                if hasattr(field, "name")
            ):
                sale_kwargs["receipt_number"] = (
                    f"RCP-{uuid.uuid4().hex[:12].upper()}"
                )

            sale = Sale.objects.create(**sale_kwargs)

            for product_id in product_ids:
                product = products[product_id]
                quantity = quantities[product_id]
                unit_price = money(product.selling_price, "Product price")
                line_total = (unit_price * quantity).quantize(
                    Decimal("0.01")
                )

                SaleItem.objects.create(
                    sale=sale,
                    product=product,
                    product_name=product.name,
                    sku=product.sku,
                    quantity=quantity,
                    unit_price=unit_price,
                    discount_Amount=ZERO,
                    tax_Amount=ZERO,
                    line_total=line_total,
                )

                stock = stocks_by_product[product_id]
                stock.quantity -= quantity
                stock.save(update_fields=["quantity", "updated_at"])

                StockMovement.objects.create(
                    stock=stock,
                    movement_type="sale",
                    quantity_change=-quantity,
                    reference=getattr(sale, "receipt_number", str(sale.pk)),
                    notes=f"Stock deducted for sale {sale.pk}",
                )

            return sale

    except IntegrityError:
        # A concurrent request may have inserted this unique key first.
        # Its transaction must finish before we can safely return its sale.
        existing = _existing_checkout(checkout_key, payload_hash)

        if existing is not None:
            return existing

        raise
