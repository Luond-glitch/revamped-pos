from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from businesses.models import Membership
from .models import Sale
from .serializers import CreateSaleSerializer
from .services import process_sale


SALES_ROLES = {"owner", "admin", "manager", "cashier"}


class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Sale.objects.none()
    serializer_class = CreateSaleSerializer
    def get_queryset(self):
        memberships = Membership.objects.filter(
            user=self.request.user,
            is_active=True,
            business__is_active=True,
            role__in=SALES_ROLES,
        ).values_list("business_id", flat=True)

        return Sale.objects.filter(
            business_id__in=memberships
        ).select_related(
            "business",
            "branch",
            "cashier",
        ).order_by("-created_at")

    @action(detail=False, methods=["post"], url_path="checkout")
    def checkout(self, request):
        serializer = CreateSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        membership = Membership.objects.filter(
            user=request.user,
            business=data["business"],
            is_active=True,
            business__is_active=True,
            role__in=SALES_ROLES,
        ).first()

        if membership is None:
            return Response(
                {"detail": "You do not have permission to make sales for this business."},
                status=status.HTTP_403_FORBIDDEN,
            )

        assignments = membership.staff_assignment.all()

        if assignments.exists() and not assignments.filter(
            branch=data["branch"]
        ).exists():
            return Response(
                {"detail": "You are not assigned to this branch."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            sale = process_sale(
                business=data["business"],
                branch=data["branch"],
                cashier=request.user,
                items=[
                    {
                        "product_id": str(item["product_id"]),
                        "quantity": item["quantity"],
                    }
                    for item in data["items"]
                ],
                customer_id=data.get("customer_id") or None,
                discount_amount=data["discount_amount"],
                tax_amount=data["tax_amount"],
                notes=data.get("notes", ""),
                checkout_key=data["checkout_key"],
            )
        except DjangoValidationError as exc:
            return Response(
                {"detail": exc.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "id": str(sale.pk),
                "sale_id": str(sale.pk),
                "receipt_number": sale.receipt_number,
                "status": sale.status,
                "subtotal": str(sale.subtotal),
                "discount_amount": str(sale.discount_amount),
                "tax_amount": str(sale.tax_amount),
                "total_amount": str(sale.total_amount),
                "checkout_key": str(sale.checkout_key),
            },
            status=status.HTTP_200_OK,
        )


class CheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CreateSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        membership = Membership.objects.filter(
            user=request.user,
            business=data["business"],
            is_active=True,
            business__is_active=True,
            role__in=SALES_ROLES,
        ).first()

        if membership is None:
            return Response(
                {"detail": "You do not have permission to make sales for this business."},
                status=status.HTTP_403_FORBIDDEN,
            )

        assignments = membership.staff_assignment.all()

        if assignments.exists() and not assignments.filter(
            branch=data["branch"]
        ).exists():
            return Response(
                {"detail": "You are not assigned to this branch."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            sale = process_sale(
                business=data["business"],
                branch=data["branch"],
                cashier=request.user,
                items=[
                    {
                        "product_id": str(item["product_id"]),
                        "quantity": item["quantity"],
                    }
                    for item in data["items"]
                ],
                customer_id=data.get("customer_id") or None,
                discount_amount=data["discount_amount"],
                tax_amount=data["tax_amount"],
                notes=data.get("notes", ""),
                checkout_key=data["checkout_key"],
            )
        except DjangoValidationError as exc:
            return Response(
                {"detail": exc.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "id": str(sale.pk),
                "sale_id": str(sale.pk),
                "receipt_number": sale.receipt_number,
                "status": sale.status,
                "subtotal": str(sale.subtotal),
                "discount_amount": str(sale.discount_amount),
                "tax_amount": str(sale.tax_amount),
                "total_amount": str(sale.total_amount),
                "checkout_key": str(sale.checkout_key),
            },
            status=status.HTTP_200_OK,
        )
