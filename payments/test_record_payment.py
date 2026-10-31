from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from businesses.models import Business, Branch
from sales.models import Sale
from payments.models import Payment
from payments.services import record_payment


class RecordPaymentTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="cashier",
            password="test-password",
        )

        self.business = Business.objects.create(
            name="Payment Test Store",
            industry="retail",
        )

        self.branch = Branch.objects.create(
            business=self.business,
            name="Main Branch",
            code="MAIN",
        )

        self.sale = Sale.objects.create(
            business=self.business,
            branch=self.branch,
            cashier=self.user,
            status="completed",
            subtotal=Decimal("1000.00"),
            discount_amount=Decimal("0.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("1000.00"),
        )

    def test_records_valid_payment(self):
        payment = record_payment(
            sale_id=self.sale.pk,
            business=self.business,
            received_by=self.user,
            amount="400.00",
            payment_method="cash",
        )

        self.assertEqual(payment.amount, Decimal("400.00"))
        self.assertEqual(payment.status, "completed")
        self.assertEqual(Payment.objects.count(), 1)

    def test_allows_multiple_partial_payments(self):
        record_payment(
            sale_id=self.sale.pk,
            business=self.business,
            received_by=self.user,
            amount="400.00",
            payment_method="cash",
        )

        record_payment(
            sale_id=self.sale.pk,
            business=self.business,
            received_by=self.user,
            amount="600.00",
            payment_method="mobile_money",
        )

        self.assertEqual(Payment.objects.count(), 2)

        total_paid = sum(
            Payment.objects.filter(
                sale=self.sale,
                status="completed",
            ).values_list("amount", flat=True)
        )

        self.assertEqual(total_paid, Decimal("1000.00"))

    def test_rejects_overpayment(self):
        with self.assertRaises(ValidationError):
            record_payment(
                sale_id=self.sale.pk,
                business=self.business,
                received_by=self.user,
                amount="1000.01",
                payment_method="cash",
            )

        self.assertEqual(Payment.objects.count(), 0)

    def test_rejects_zero_payment(self):
        with self.assertRaises(ValidationError):
            record_payment(
                sale_id=self.sale.pk,
                business=self.business,
                received_by=self.user,
                amount="0",
                payment_method="cash",
            )

        self.assertEqual(Payment.objects.count(), 0)

    def test_rejects_invalid_payment_method(self):
        with self.assertRaises(ValidationError):
            record_payment(
                sale_id=self.sale.pk,
                business=self.business,
                received_by=self.user,
                amount="100.00",
                payment_method="cheque",
            )

        self.assertEqual(Payment.objects.count(), 0)

    def test_rejects_payment_for_another_business(self):
        another_business = Business.objects.create(
            name="Another Store",
            industry="retail",
        )

        with self.assertRaises(ValidationError):
            record_payment(
                sale_id=self.sale.pk,
                business=another_business,
                received_by=self.user,
                amount="100.00",
                payment_method="cash",
            )

        self.assertEqual(Payment.objects.count(), 0)

    def test_rejects_payment_for_non_completed_sale(self):
        for invalid_status in ("draft", "voided", "refunded"):
            self.sale.status = invalid_status
            self.sale.save(update_fields=["status"])

            with self.subTest(status=invalid_status):
                with self.assertRaises(ValidationError):
                    record_payment(
                        sale_id=self.sale.pk,
                        business=self.business,
                        received_by=self.user,
                        amount="100.00",
                        payment_method="cash",
                    )

        self.assertEqual(Payment.objects.count(), 0)

    def test_idempotent_payment_returns_existing_payment(self):
        import uuid

        key = uuid.uuid4()

        first = record_payment(
            sale_id=self.sale.pk,
            business=self.business,
            received_by=self.user,
            amount="400.00",
            payment_method="cash",
            idempotency_key=key,
        )

        second = record_payment(
            sale_id=self.sale.pk,
            business=self.business,
            received_by=self.user,
            amount="400.00",
            payment_method="cash",
            idempotency_key=key,
        )

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(Payment.objects.count(), 1)

    def test_idempotency_key_cannot_be_reused_for_different_amount(self):
        import uuid

        key = uuid.uuid4()

        record_payment(
            sale_id=self.sale.pk,
            business=self.business,
            received_by=self.user,
            amount="400.00",
            payment_method="cash",
            idempotency_key=key,
        )

        with self.assertRaises(ValidationError):
            record_payment(
                sale_id=self.sale.pk,
                business=self.business,
                received_by=self.user,
                amount="500.00",
                payment_method="cash",
                idempotency_key=key,
            )

        self.assertEqual(Payment.objects.count(), 1)

    def test_different_idempotency_keys_allow_separate_payments(self):
        import uuid

        first = record_payment(
            sale_id=self.sale.pk,
            business=self.business,
            received_by=self.user,
            amount="300.00",
            payment_method="cash",
            idempotency_key=uuid.uuid4(),
        )

        second = record_payment(
            sale_id=self.sale.pk,
            business=self.business,
            received_by=self.user,
            amount="200.00",
            payment_method="cash",
            idempotency_key=uuid.uuid4(),
        )

        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(Payment.objects.count(), 2)
