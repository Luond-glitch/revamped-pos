from django.core.exceptions import ValidationError as DjangoValidationError

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from businesses.models import Membership
from .receipt import get_receipt_data
from .models import Sale


class SaleReceiptView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, sale_id):
        sale = Sale.objects.filter(
            pk=sale_id,
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
        ).first()

        if membership is None:
            return Response(
                {"detail": "Sale not found or access denied."},
                status=status.HTTP_404_NOT_FOUND,
            )

        assignments = membership.staff_assignment.all()

        if assignments.exists() and not assignments.filter(
            branch=sale.branch
        ).exists():
            return Response(
                {"detail": "Sale not found or access denied."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            receipt = get_receipt_data(
                sale_id=sale.pk,
                business=sale.business,
            )
        except DjangoValidationError as exc:
            return Response(
                {"detail": exc.messages},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(receipt, status=status.HTTP_200_OK)
