from django.db import models
import uuid
from django.core.validators import MinValueValidator
# Create your models here.
class Category(models.Model):
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 business=models.ForeignKey("businesses.Business",on_delete=models.PROTECT,related_name="categories")
 name=models.CharField(max_length=100)
 description=models.TextField(blank=True)
 is_active=models.BooleanField(default=True)
 created_at=models.DateTimeField(auto_now_add=True)
 
 class Meta:
  verbose_name_plural="categories"
  ordering=["name"]
  constraints=[models.UniqueConstraint(fields=["business","name"],name="unique_category_name_per_business")]
  
  def __str__(self):
   return f"{self.business.name} - {self.name}"

class Product(models.Model):
 id = models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 business=models.ForeignKey("businesses.Business",on_delete=models.PROTECT,related_name="products")
 category=models.ForeignKey(Category,on_delete=models.PROTECT,related_name="products")
 name=models.CharField(max_length=200)
 sku=models.CharField(max_length=100)
 barcode=models.CharField(max_length=100,blank=True)
 description=models.TextField(blank=True)
 cost_price=models.DecimalField(max_digits=12,decimal_places=2,validators=[MinValueValidator(0)])
 selling_price=models.DecimalField(max_digits=12,decimal_places=2,validators=[MinValueValidator(0)])
 is_active=models.BooleanField(default=True)
 created_at=models.DateTimeField(auto_now_add=True)
 updated_at=models.DateTimeField(auto_now=True)
 
 class Meta:
  constraints=[models.UniqueConstraint(fields=["business","sku"],name="unique_product_sku_per_business")]
 def __str__(self):
  return f"{self.sku} - {self.name}"

class Stock(models.Model):
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 branch=models.ForeignKey("businesses.Branch",on_delete=models.PROTECT,related_name="stock_records")
 product=models.ForeignKey(Product,on_delete=models.PROTECT,related_name="stock_records")
 quantity=models.DecimalField(max_digits=12,decimal_places=3,default=0,validators=[MinValueValidator(0)])
 reorder_level=models.DecimalField(max_digits=12,decimal_places=3,default=0,validators=[MinValueValidator(0)])
 updated_at=models.DateTimeField(auto_now=True)
 
 class Meta:
  constraints=[models.UniqueConstraint(fields=["branch","product"],name="unique_produt_stock_per_branch")]
  def __str__(self):
   return f"{self.product.name} - {self.branch.name}"

class StockMovement(models.Model):
 MOVEMENT_TYPES=[("receipt","Stock Receipt"),("sale","Sale"),("return","Return"),("adjustment","Stock Adjustment"),("transfer_in","Transfer In"),("transfer_out","Transfer Out")]
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 stock=models.ForeignKey(Stock,on_delete=models.PROTECT,related_name="movements")
 movement_type=models.CharField(max_length=20,choices=MOVEMENT_TYPES)
 quantity_change=models.DecimalField(max_digits=12,decimal_places=3)
 reference=models.CharField(max_length=100,blank=True)
 notes=models.TextField(blank=True)
 created_at=models.DateTimeField(auto_now_add=True)
 
 class Meta:
  ordering=["-created_at"]

 def __str__(self):
  return (f"{self.stock.product.name} -" f"{self.movement_type}: {self.quantity_change}")
