from rest_framework import serializers

from .models import Product, Category, Stock, StockMovement


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = [
            "id",
            "business",
            "name",
            "description",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        business = attrs.get(
            "business",
            getattr(self.instance, "business", None),
        )
        name = attrs.get(
            "name",
            getattr(self.instance, "name", None),
        )

        if business and name:
            existing = Category.objects.filter(
                business=business,
                name=name,
            )

            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)

            if existing.exists():
                raise serializers.ValidationError({
                    "name": (
                        "A category with this name already exists "
                        "in this business."
                    )
                })

        return attrs


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(
        source="category.name",
        read_only=True,
    )

    class Meta:
        model = Product
        fields = [
            "id",
            "business",
            "category",
            "category_name",
            "name",
            "sku",
            "barcode",
            "description",
            "cost_price",
            "selling_price",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        business = attrs.get(
            "business",
            getattr(self.instance, "business", None),
        )
        category = attrs.get(
            "category",
            getattr(self.instance, "category", None),
        )
        sku = attrs.get(
            "sku",
            getattr(self.instance, "sku", None),
        )

        if business and category and category.business_id != business.id:
            raise serializers.ValidationError({
                "category": (
                    "The selected category must belong to "
                    "the selected business."
                )
            })

        if business and sku:
            existing = Product.objects.filter(
                business=business,
                sku=sku,
            )

            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)

            if existing.exists():
                raise serializers.ValidationError({
                    "sku": (
                        "A product with this SKU already exists "
                        "in this business."
                    )
                })

        return attrs


class StockSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="product.name",
        read_only=True,
    )
    branch_name = serializers.CharField(
        source="branch.name",
        read_only=True,
    )

    class Meta:
        model = Stock
        fields = [
            "id",
            "branch",
            "branch_name",
            "product",
            "product_name",
            "quantity",
            "reorder_level",
            "updated_at",
        ]
        read_only_fields = ["id", "quantity", "updated_at"]

    def validate(self, attrs):
        branch = attrs.get(
            "branch",
            getattr(self.instance, "branch", None),
        )
        product = attrs.get(
            "product",
            getattr(self.instance, "product", None),
        )

        if branch and product:
            if branch.business_id != product.business_id:
                raise serializers.ValidationError(
                    "The branch and product must belong to the same business."
                )

        return attrs


class StockMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovement
        fields = [
            "id",
            "stock",
            "movement_type",
            "quantity_change",
            "reference",
            "notes",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "stock",
            "movement_type",
            "quantity_change",
            "reference",
            "notes",
            "created_at",
        ]
