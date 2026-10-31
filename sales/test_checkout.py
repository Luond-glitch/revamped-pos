from decimal import Decimal
import uuid

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from businesses.models import Business, Branch
from inventory.models import Category, Product, Stock, StockMovement
from sales.models import Sale, SaleItem
from sales.services import process_sale


class CheckoutTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username="cashier",
            password="test-password",
        )

        self.business = Business.objects.create(
            name="Test Store",
            industry="retail",
        )

        self.branch = Branch.objects.create(
            business=self.business,
            name="Main Branch",
            code="MAIN",
        )

        self.category = Category.objects.create(
            business=self.business,
            name="Drinks",
        )

        self.product = Product.objects.create(
            business=self.business,
            category=self.category,
            name="Water",
            sku="WATER-001",
            cost_price=Decimal("30.00"),
            selling_price=Decimal("50.00"),
        )

        self.stock = Stock.objects.create(
            branch=self.branch,
            product=self.product,
            quantity=Decimal("20.000"),
            reorder_level=Decimal("5.000"),
        )

        self.items = [
            {
                "product_id": str(self.product.pk),
                "quantity": "2",
            }
        ]

    def test_successful_checkout_creates_sale_and_deducts_stock(self):
        sale = process_sale(
            business=self.business,
            branch=self.branch,
            cashier=self.user,
            items=self.items,
        )

        self.stock.refresh_from_db()

        self.assertEqual(sale.status, "completed")
        self.assertEqual(sale.subtotal, Decimal("100.00"))
        self.assertEqual(sale.total_amount, Decimal("100.00"))
        self.assertEqual(self.stock.quantity, Decimal("18.000"))

        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(SaleItem.objects.filter(sale=sale).count(), 1)

        movement = StockMovement.objects.get(stock=self.stock)
        self.assertEqual(movement.movement_type, "sale")
        self.assertEqual(movement.quantity_change, Decimal("-2"))

    def test_repeated_checkout_does_not_create_duplicate_sale(self):
        checkout_key = uuid.uuid4()

        first_sale = process_sale(
            business=self.business,
            branch=self.branch,
            cashier=self.user,
            items=self.items,
            checkout_key=checkout_key,
        )

        second_sale = process_sale(
            business=self.business,
            branch=self.branch,
            cashier=self.user,
            items=self.items,
            checkout_key=checkout_key,
        )

        self.stock.refresh_from_db()

        self.assertEqual(first_sale.pk, second_sale.pk)
        self.assertEqual(Sale.objects.count(), 1)
        self.assertEqual(SaleItem.objects.count(), 1)
        self.assertEqual(StockMovement.objects.count(), 1)
        self.assertEqual(self.stock.quantity, Decimal("18.000"))

    def test_reusing_checkout_key_with_different_basket_is_rejected(self):
        checkout_key = uuid.uuid4()

        process_sale(
            business=self.business,
            branch=self.branch,
            cashier=self.user,
            items=self.items,
            checkout_key=checkout_key,
        )

        changed_items = [
            {
                "product_id": str(self.product.pk),
                "quantity": "3",
            }
        ]

        with self.assertRaises(ValidationError):
            process_sale(
                business=self.business,
                branch=self.branch,
                cashier=self.user,
                items=changed_items,
                checkout_key=checkout_key,
            )

        self.assertEqual(Sale.objects.count(), 1)

    def test_insufficient_stock_does_not_create_sale(self):
        insufficient_items = [
            {
                "product_id": str(self.product.pk),
                "quantity": "25",
            }
        ]

        with self.assertRaises(ValidationError):
            process_sale(
                business=self.business,
                branch=self.branch,
                cashier=self.user,
                items=insufficient_items,
            )

        self.stock.refresh_from_db()

        self.assertEqual(self.stock.quantity, Decimal("20.000"))
        self.assertEqual(Sale.objects.count(), 0)
        self.assertEqual(SaleItem.objects.count(), 0)
        self.assertEqual(StockMovement.objects.count(), 0)

    def test_empty_basket_is_rejected(self):
        with self.assertRaises(ValidationError):
            process_sale(
                business=self.business,
                branch=self.branch,
                cashier=self.user,
                items=[],
            )

        self.assertEqual(Sale.objects.count(), 0)

    def test_duplicate_products_in_basket_are_rejected(self):
        duplicate_items = [
            {
                "product_id": str(self.product.pk),
                "quantity": "1",
            },
            {
                "product_id": str(self.product.pk),
                "quantity": "2",
            },
        ]

        with self.assertRaises(ValidationError):
            process_sale(
                business=self.business,
                branch=self.branch,
                cashier=self.user,
                items=duplicate_items,
            )

        self.assertEqual(Sale.objects.count(), 0)
