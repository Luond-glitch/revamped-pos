from decimal import Decimal

from django.core.exceptions import ValidationError

from sales.models import Sale


def get_receipt_data(*, sale_id, business):
    """
    Return receipt information for a sale belonging to a business.
    """

    sale = (
        Sale.objects
        .select_related("business", "branch", "cashier")
        .prefetch_related("sale_items")
        .filter(pk=sale_id, business=business)
        .first()
    )

    if sale is None:
        raise ValidationError("Sale not found.")

    items = []

    for item in sale.sale_items.all():
        items.append({
            "product_name": item.product_name,
            "sku": item.sku,
            "quantity": str(item.quantity),
            "unit_price": str(item.unit_price),
            "line_total": str(item.line_total),
        })

    return {
        "receipt_number": sale.receipt_number,
        "business_name": sale.business.name,
        "branch_name": sale.branch.name,
        "cashier": sale.cashier.username,
        "created_at": sale.created_at.isoformat(),
        "items": items,
        "subtotal": str(sale.subtotal),
        "discount_amount": str(sale.discount_amount),
        "tax_amount": str(sale.tax_amount),
        "total_amount": str(sale.total_amount),
        "status": sale.status,
    }
