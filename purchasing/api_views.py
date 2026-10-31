from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from businesses.models import Branch, Membership
from inventory.models import Product
from purchasing.models import Supplier, Purchase, PurchaseItem

class PurchasingAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_membership(self, request, business_id):
        membership = Membership.objects.filter(
            user=request.user,
            business_id=business_id,
            is_active=True,
        ).first()

        if membership is None:
            raise PermissionDenied(
                "You do not have access to this business."
            )

        return membership

    def require_purchasing_access(self, membership):
        allowed_roles = [
            "owner", "admin", "manager", "stock_manager"
        ]

        if membership.role not in allowed_roles:
            raise PermissionDenied(
                "You are not allowed to manage purchasing."
            )


class SupplierListCreateView(PurchasingAPIView):
    def get(self, request):
        business_id = request.query_params.get("business_id")

        if not business_id:
            raise ValidationError({
                "business_id": "This query parameter is required."
            })

        self.get_membership(request, business_id)

        suppliers = Supplier.objects.filter(
            business_id=business_id
        ).order_by("name")

        return Response(
            SupplierSerializer(suppliers, many=True).data
        )

    def post(self, request):
        business_id = request.data.get("business_id")

        if not business_id:
            raise ValidationError({
                "business_id": "This field is required."
            })

        membership = self.get_membership(request, business_id)
        self.require_purchasing_access(membership)

        serializer = SupplierSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        supplier = serializer.save(business_id=business_id)

        return Response(
            SupplierSerializer(supplier).data,
            status=status.HTTP_201_CREATED,
        )


class PurchaseListView(PurchasingAPIView):
    def get(self, request):
        business_id = request.query_params.get("business_id")

        if not business_id:
            raise ValidationError({
                "business_id": "This query parameter is required."
            })

        membership = self.get_membership(request, business_id)

        purchases = Purchase.objects.filter(
            business_id=business_id
        )

        if membership.role not in ["owner", "admin"]:
            assigned_branch_ids = membership.branch_assignments.values_list(
                "branch_id",
                flat=True,
            )
            purchases = purchases.filter(
                branch_id__in=assigned_branch_ids
            )

        branch_id = request.query_params.get("branch_id")
        if branch_id:
            if not purchases.filter(branch_id=branch_id).exists():
                # An empty result is valid, but an inaccessible branch
                # must not expose another branch's purchase records.
                branch = Branch.objects.filter(
                    id=branch_id,
                    business_id=business_id,
                    is_active=True,
                ).first()

                if branch is None:
                    raise ValidationError({
                        "branch_id": "Invalid branch for this business."
                    })

                if membership.role not in ["owner", "admin"]:
                    if not membership.branch_assignments.filter(
                        branch=branch
                    ).exists():
                        raise PermissionDenied(
                            "You are not assigned to this branch."
                        )

            purchases = purchases.filter(branch_id=branch_id)

        purchase_status = request.query_params.get("status")
        if purchase_status:
            purchases = purchases.filter(status=purchase_status)

        purchases = purchases.order_by("-created_at")

        return Response(
            PurchaseSerializer(purchases, many=True).data
        )


class PurchaseCreateView(PurchasingAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        business_id = request.data.get("business_id")
        branch_id = request.data.get("branch_id")
        supplier_id = request.data.get("supplier_id")
        items = request.data.get("items")

        if not business_id or not branch_id or not supplier_id:
            raise ValidationError({
                "business_id": "This field is required.",
                "branch_id": "This field is required.",
                "supplier_id": "This field is required.",
            })

        if not isinstance(items, list) or not items:
            raise ValidationError({
                "items": "Provide at least one purchase item."
            })

        membership = self.get_membership(request, business_id)
        self.require_purchasing_access(membership)

        if membership.role not in ["owner", "admin"]:
            if not membership.branch_assignments.filter(
                branch_id=branch_id
            ).exists():
                raise PermissionDenied(
                    "You are not assigned to this branch."
                )

        branch = get_object_or_404(
            Branch,
            id=branch_id,
            business_id=business_id,
            is_active=True,
        )

        supplier = get_object_or_404(
            Supplier,
            id=supplier_id,
            business_id=business_id,
            is_active=True,
        )

        prepared_items = []
        total_amount = Decimal("0.00")

        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise ValidationError({
                    "items": f"Item {index + 1} must be an object."
                })

            product_id = item.get("product_id")

            try:
                quantity = Decimal(str(item.get("quantity")))
                unit_cost = Decimal(str(item.get("unit_cost")))
            except (InvalidOperation, TypeError, ValueError):
                raise ValidationError({
                    "items": (
                        f"Item {index + 1} has an invalid quantity "
                        "or unit cost."
                    )
                })

            if (
                not quantity.is_finite()
                or quantity <= 0
                or quantity.as_tuple().exponent < -3
            ):
                raise ValidationError({
                    "items": (
                        f"Item {index + 1} quantity must be positive "
                        "and have at most 3 decimal places."
                    )
                })

            if (
                not unit_cost.is_finite()
                or unit_cost < 0
                or unit_cost.as_tuple().exponent < -2
            ):
                raise ValidationError({
                    "items": (
                        f"Item {index + 1} unit cost must be "
                        "non-negative and have at most 2 decimal places."
                    )
                })

            product = get_object_or_404(
                Product,
                id=product_id,
                business_id=business_id,
                is_active=True,
            )

            line_total = (quantity * unit_cost).quantize(
                Decimal("0.01")
            )

            prepared_items.append({
                "product": product,
                "quantity": quantity,
                "unit_cost": unit_cost,
                "line_total": line_total,
            })

            total_amount += line_total

        with transaction.atomic():
            purchase = Purchase.objects.create(
                business_id=business_id,
                branch=branch,
                supplier=supplier,
                created_by=request.user,
                reference_number=request.data.get(
                    "reference_number", ""
                ),
                notes=request.data.get("notes", ""),
                total_amount=total_amount,
                status="draft",
            )

            PurchaseItem.objects.bulk_create([
                PurchaseItem(
                    purchase=purchase,
                    product=item["product"],
                    quantity=item["quantity"],
                    unit_cost=item["unit_cost"],
                    line_total=item["line_total"],
                )
                for item in prepared_items
            ])

        return Response(
            {
                "message": "Purchase created successfully.",
                "purchase_id": str(purchase.id),
                "reference_number": purchase.reference_number,
                "status": purchase.status,
                "total_amount": str(purchase.total_amount),
                "items_count": len(prepared_items),
            },
            status=status.HTTP_201_CREATED,
        )

class ReceivePurchaseView(PurchasingAPIView):
    def post(self, request, purchase_id):
        business_id = request.data.get("business_id")

        if not business_id:
            raise ValidationError({
                "business_id": "This field is required."
            })

        membership = self.get_membership(request, business_id)
        self.require_purchasing_access(membership)

        with transaction.atomic():
            purchase = get_object_or_404(
                Purchase.objects.select_for_update(),
                id=purchase_id,
                business_id=business_id,
            )

            if membership.role not in ["owner", "admin"]:
                assigned = membership.branch_assignments.filter(
                    branch_id=purchase.branch_id
                ).exists()

                if not assigned:
                    raise PermissionDenied(
                        "You are not assigned to this purchase's branch."
                    )

            if purchase.status != "draft":
                raise ValidationError({
                    "status": (
                        "Only draft purchases can be received."
                    )
                })

            items = list(
                purchase.items.select_related("product").all()
            )

            if not items:
                raise ValidationError({
                    "items": "Cannot receive a purchase with no items."
                })

            for item in items:
                if item.product.business_id != purchase.business_id:
                    raise ValidationError({
                        "items": (
                            "A purchased product belongs to another business."
                        )
                    })

                stock, _ = Stock.objects.get_or_create(
                    branch=purchase.branch,
                    product=item.product,
                    defaults={
                        "quantity": 0,
                        "reorder_level": 0,
                    },
                )

                stock = Stock.objects.select_for_update().get(
                    pk=stock.pk
                )

                stock.quantity += item.quantity
                stock.save(update_fields=["quantity", "updated_at"])

                StockMovement.objects.create(
                    stock=stock,
                    movement_type="receipt",
                    quantity_change=item.quantity,
                    reference=str(purchase.id),
                    notes=(
                        f"Received purchase "
                        f"{purchase.reference_number or purchase.id}"
                    ),
                )

            purchase.status = "received"
            purchase.received_at = timezone.now()
            purchase.save(update_fields=["status", "received_at"])

        return Response(
            {
                "message": "Purchase received successfully.",
                "purchase_id": str(purchase.id),
                "status": purchase.status,
                "received_at": purchase.received_at.isoformat(),
                "items_received": len(items),
            },
            status=status.HTTP_200_OK,
        )
