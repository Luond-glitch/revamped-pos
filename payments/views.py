from django.core.exceptions import ValidationError as DjangoValidationError

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from businesses.models import Membership
from sales.models import Sale

from .serializers import PaymentCreateSerializer
from .services import record_payment


PAYMENT_ROLES = {"owner", "admin", "manager", "cashier"}


class PaymentCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        sale = Sale.objects.filter(
            pk=data["sale_id"],
            business__is_active=True,
        ).first()

        if sale is None:
            return Response(
                {"detail": "Sale not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        membership = Membership.objects.filter(
            user=request.user,
            business=sale.business,
            is_active=True,
            role__in=PAYMENT_ROLES,
        ).first()

        if membership is None:
            return Response(
                {"detail": "You cannot record payments for this business."},
                status=status.HTTP_403_FORBIDDEN,
            )

        assignments = membership.staff_assignment.all()

        if assignments.exists() and not assignments.filter(
            branch=sale.branch
        ).exists():
            return Response(
                {"detail": "You are not assigned to this branch."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            payment = record_payment(
                sale_id=sale.pk,
                business=sale.business,
                received_by=request.user,
                amount=data["amount"],
                payment_method=data["payment_method"],
                transaction_reference=data.get(
                    "transaction_reference", ""
                ),
                notes=data.get("notes", ""),
                idempotency_key=data.get("idempotency_key"),
            )
        except DjangoValidationError as exc:
            return Response(
                {"detail": exc.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "id": str(payment.pk),
                "sale_id": str(payment.sale_id),
                "amount": str(payment.amount),
                "payment_method": payment.payment_method,
                "status": payment.status,
                "transaction_reference": payment.transaction_reference,
                "idempotency_key": (
                    str(payment.idempotency_key)
                    if payment.idempotency_key else None
                ),
            },
            status=(
                status.HTTP_200_OK
                if data.get("idempotency_key")
                else status.HTTP_201_CREATED
            ),
        )
