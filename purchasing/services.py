from django.core.exceptions import ValidationError
from django.db import transaction

from inventory.services import record_stock_movement
from inventory.models import Product, Stock
from businesses.models import Branch


@transaction.atomic
def receive_purchase(
    *,
    branch_id,
    product_id,
    quantity,
    reference="",
    notes="",
):
    """
    Receive purchased goods into a branch's inventory.

    Creates a stock record when the branch does not yet have
    one for the product, then records the stock receipt.
    """
    branch = Branch.objects.select_for_update().filter(
        pk=branch_id,
        is_active=True,
        business__is_active=True,
    ).first()

    if branch is None:
        raise ValidationError("The active branch does not exist.")

    product = Product.objects.filter(
        pk=product_id,
        business_id=branch.business_id,
        is_active=True,
    ).first()

    if product is None:
        raise ValidationError(
            "The active product must belong to the selected branch's business."
        )

    # get_or_create avoids creating a second stock row for the same
    # branch and product when the database constraint is in place.
    stock, _ = Stock.objects.get_or_create(
        branch=branch,
        product=product,
        defaults={"quantity": 0, "reorder_level": 0},
    )

    updated_stock, movement = record_stock_movement(
        stock_id=stock.pk,
        movement_type="receipt",
        quantity_change=quantity,
        reference=reference,
        notes=notes,
    )

    return updated_stock, movement
