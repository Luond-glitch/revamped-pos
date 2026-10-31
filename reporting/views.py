from datetime import timedelta
from decimal import Decimal
from payments.models import Payment
from django.db.models import Sum, Count, Avg, F, Q
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied

from businesses.models import Business, Membership, Branch
from sales.models import Sale, SaleItem
from inventory.models import Product, Stock
from purchasing.models import Purchase


def get_report_context(request):
    """Validate business membership and branch access."""
    business_id = request.query_params.get("business_id")
    branch_id = request.query_params.get("branch_id")

    if not business_id:
        raise ValidationError({
            "business_id": "This query parameter is required."
        })

    business = Business.objects.filter(
        id=business_id,
        is_active=True,
    ).first()

    if business is None:
        raise ValidationError({
            "business_id": "Business not found or inactive."
        })

    membership = Membership.objects.filter(
        user=request.user,
        business=business,
        is_active=True,
    ).first()

    if membership is None:
        raise PermissionDenied(
            "You do not have access to this business."
        )

    branch = None

    if membership.role in ["owner", "admin"]:
        if branch_id:
            branch = Branch.objects.filter(
                id=branch_id,
                business=business,
                is_active=True,
            ).first()

            if branch is None:
                raise ValidationError({
                    "branch_id": "Invalid branch for this business."
                })
    else:
        assigned_branches = Branch.objects.filter(
            business=business,
            is_active=True,
            staff_assignments__membership=membership,
        ).distinct()

        if not branch_id:
            if assigned_branches.count() != 1:
                raise PermissionDenied(
                    "Select a branch assigned to your account."
                )
            branch = assigned_branches.first()
        else:
            branch = assigned_branches.filter(id=branch_id).first()
            if branch is None:
                raise PermissionDenied(
                    "You are not assigned to this branch."
                )

    return business, branch, membership


def get_sales_queryset(business, branch=None):
    """
    Return completed sales belonging to the selected
    business and, optionally, branch.
    """
    sales = Sale.objects.filter(
        business=business,
        status="completed",
    )

    if branch is not None:
        sales = sales.filter(branch=branch)

    return sales


def get_stock_queryset(business, branch=None):
    """
    Return stock belonging to the selected business.
    """
    stock = Stock.objects.filter(
        branch__business=business,
        product__is_active=True,
    ).select_related("product", "branch")

    if branch is not None:
        stock = stock.filter(branch=branch)

    return stock


def decimal_string(value):
    return str(value if value is not None else Decimal("0.00"))


class DashboardReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business, branch, membership = get_report_context(request)

        sales = get_sales_queryset(business, branch)
        stock = get_stock_queryset(business, branch)

        today = timezone.localdate()

        sales_today = sales.filter(
            created_at__date=today
        )

        sales_summary = sales.aggregate(
            total_sales=Sum("total_amount"),
            sales_count=Count("id"),
            average_sale=Avg("total_amount"),
        )

                # Calculate completed payments for the selected business and branch.
        # Payments belonging to the filtered sales only.
        payments = Payment.objects.filter(
            business=business,
            sale__in=sales,
            status="completed",
            sale__status="completed",
        )

        payment_summary = payments.aggregate(
            money_received=Sum("amount"),
            payment_count=Count("id"),
        )
        
        today_summary = sales_today.aggregate(
            total_sales=Sum("total_amount"),
            sales_count=Count("id"),
        )

        low_stock = stock.filter(
            quantity__lte=F("reorder_level")
        )

        low_stock_items = [
            {
                "product_id": str(item.product_id),
                "product_name": item.product.name,
                "sku": item.product.sku,
                "branch": item.branch.name,
                "quantity": str(item.quantity),
                "reorder_level": str(item.reorder_level),
            }
            for item in low_stock.order_by("quantity")[:20]
        ]

        total_products = Product.objects.filter(
            business=business,
            is_active=True,
        ).count()

        pending_purchases = Purchase.objects.filter(
            business=business,
            status="draft",
        ).count()

        recent_sales = sales.select_related(
            "branch", "cashier", "customer"
        ).order_by("-created_at")[:10]

        recent_sales_data = [
            {
                "id": str(sale.id),
                "receipt_number": sale.receipt_number,
                "branch": sale.branch.name,
                "cashier": (
                    sale.cashier.username
                    if sale.cashier else None
                ),
                "customer": (
                    sale.customer.name
                    if sale.customer else None
                ),
                "total_amount": str(sale.total_amount),
                "created_at": sale.created_at.isoformat(),
            }
            for sale in recent_sales
        ]

        top_products = SaleItem.objects.filter(
            sale__in=sales
        ).values(
            "product_id",
            "product_name",
            "sku",
        ).annotate(
            quantity_sold=Sum("quantity"),
            revenue=Sum("line_total"),
        ).order_by("-quantity_sold")[:5]

        top_products_data = [
            {
                "product_id": str(item["product_id"]),
                "product_name": item["product_name"],
                "sku": item["sku"],
                "quantity_sold": str(item["quantity_sold"]),
                "revenue": str(item["revenue"] or Decimal("0.00")),
            }
            for item in top_products
        ]

        return Response({
            "business_id": str(business.id),
            "business_name": business.name,
            "branch_id": str(branch.id) if branch else None,
            "branch_name": branch.name if branch else "All branches",
            "currency": business.currency,

            "sales": {
                "total_sales": decimal_string(
                    sales_summary["total_sales"]
                ),
                "sales_count": sales_summary["sales_count"],
                "average_sale": decimal_string(
                    sales_summary["average_sale"]
                ),
            },

            "sales_today": {
                "total_sales": decimal_string(
                    today_summary["total_sales"]
                ),
                "sales_count": today_summary["sales_count"],
            },

            "inventory": {
                "total_products": total_products,
                "low_stock_count": low_stock.count(),
                "low_stock_items": low_stock_items,
            },

            "purchasing": {
                "pending_purchases": pending_purchases,
            },

            "recent_sales": recent_sales_data,
            "top_selling_products": top_products_data,

            "money_received": str(payment_summary["money_received"] or Decimal("0.00")),
            "completed_payment_count": payment_summary["payment_count"],
        })


class SalesReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business, branch, membership = get_report_context(request)

        sales = get_sales_queryset(business, branch)

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        if start_date:
            sales = sales.filter(created_at__date__gte=start_date)

        if end_date:
            sales = sales.filter(created_at__date__lte=end_date)

        summary = sales.aggregate(
            total_revenue=Sum("total_amount"),
            transaction_count=Count("id"),
            average_sale=Avg("total_amount"),
        )

        sales_data = sales.select_related(
            "branch", "cashier"
        ).order_by("-created_at")[:100]

        return Response({
            "business_id": str(business.id),
            "branch_id": str(branch.id) if branch else None,
            "start_date": start_date,
            "end_date": end_date,
            "total_revenue": decimal_string(
                summary["total_revenue"]
            ),
            "transaction_count": summary["transaction_count"],
            "average_sale": decimal_string(
                summary["average_sale"]
            ),
            "sales": [
                {
                    "id": str(sale.id),
                    "receipt_number": sale.receipt_number,
                    "branch": sale.branch.name,
                    "cashier": (
                        sale.cashier.username
                        if sale.cashier else None
                    ),
                    "subtotal": str(sale.subtotal),
                    "discount": str(sale.discount_amount),
                    "tax": str(sale.tax_amount),
                    "total": str(sale.total_amount),
                    "created_at": sale.created_at.isoformat(),
                }
                for sale in sales_data
            ],
        })


class InventoryReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business, branch, membership = get_report_context(request)

        stock = get_stock_queryset(business, branch)

        low_stock = stock.filter(
            quantity__lte=F("reorder_level")
        )

        stock_data = stock.order_by(
            "product__name", "branch__name"
        )[:500]

        return Response({
            "business_id": str(business.id),
            "branch_id": str(branch.id) if branch else None,
            "total_products": Product.objects.filter(
                business=business,
                is_active=True,
            ).count(),
            "low_stock_count": low_stock.count(),
            "stock": [
                {
                    "product_id": str(item.product_id),
                    "product_name": item.product.name,
                    "sku": item.product.sku,
                    "branch": item.branch.name,
                    "quantity": str(item.quantity),
                    "reorder_level": str(item.reorder_level),
                    "unit_cost": str(item.product.cost_price),
                    "stock_cost_value": str(
                        item.quantity * item.product.cost_price
                    ),
                }
                for item in stock_data
            ],
        })


class PurchasingReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        business, branch, membership = get_report_context(request)

        purchases = Purchase.objects.filter(
            business=business
        ).select_related("supplier", "branch")

        if branch is not None:
            purchases = purchases.filter(branch=branch)

        summary = purchases.aggregate(
                total_purchases=Count("id"),
                 received_purchases=Count("id",filter=Q(status="received"),
    ),
)

        purchase_data = purchases.order_by("-created_at")[:100]

        return Response({
            "business_id": str(business.id),
            "branch_id": str(branch.id) if branch else None,
            "total_purchases": summary["total_purchases"],
            "received_purchases": summary["received_purchases"],
            "pending_purchases": purchases.filter(
                status="draft"
            ).count(),
            "purchases": [
                {
                    "id": str(purchase.id),
                    "reference_number": purchase.reference_number,
                    "supplier": purchase.supplier.name,
                    "branch": purchase.branch.name,
                    "status": purchase.status,
                    "total_amount": str(purchase.total_amount),
                    "created_at": purchase.created_at.isoformat(),
                    "received_at": (
                        purchase.received_at.isoformat()
                        if purchase.received_at else None
                    ),
                }
                for purchase in purchase_data
            ],
        })
