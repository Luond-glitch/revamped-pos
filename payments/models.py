import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Payment(models.Model):
    PAYMENT_METHODS = [
        ("cash", "Cash"),
        ("mobile_money", "Mobile Money"),
        ("card", "Card"),
        ("bank_transfer", "Bank Transfer"),
        ("other", "Other"),
    ]

    PAYMENT_STATUSES = [
        ("completed", "Completed"),
        ("pending", "Pending"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    ]

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.PROTECT,
        related_name="payments",
    )

    sale = models.ForeignKey(
        "sales.Sale",
        on_delete=models.PROTECT,
        related_name="payments",
    )

    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )

    payment_method = models.CharField(
        max_length=30,
        choices=PAYMENT_METHODS,
    )

    status = models.CharField(
        max_length=20,
        choices=PAYMENT_STATUSES,
        default="completed",
    )

    transaction_reference = models.CharField(
        max_length=150,
        blank=True,
    )

    notes = models.TextField(blank=True)

    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="payments_received",
        null=True,
        blank=True,
    )

    idempotency_key = models.UUIDField(
        null=True,
        blank=True,
        unique=True,
        editable=False,
    )
