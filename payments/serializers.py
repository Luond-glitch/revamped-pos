from decimal import Decimal

from rest_framework import serializers


class PaymentCreateSerializer(serializers.Serializer):
    sale_id = serializers.UUIDField()

    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )

    payment_method = serializers.ChoiceField(
        choices=[
            ("cash", "Cash"),
            ("mobile_money", "Mobile Money"),
            ("card", "Card"),
            ("bank_transfer", "Bank Transfer"),
        ]
    )

    transaction_reference = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=150,
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True,
    )

    idempotency_key = serializers.UUIDField(
        required=False,
        allow_null=True,
    )
