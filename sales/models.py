from django.db import models
import uuid
from django.conf import settings
from django.core.validators import MinValueValidator

# Create your models here.
class Customer(models.Model):
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 business=models.ForeignKey("businesses.Business",on_delete=models.PROTECT,related_name="customers")
 name=models.CharField(max_length=200)
 phone_number=models.CharField(max_length=30,blank=True)
 email=models.EmailField(blank=True)
 address=models.TextField(blank=True)
 is_active=models.BooleanField(default=True)
 created_at=models.DateTimeField(auto_now_add=True)
 
 class Meta:
  ordering=['name']
 def __str__(self):
  return self.name
class Sale(models.Model):
 STATUS_CHOICES=[('draft','Draft'),('completed','Completed'),('voided','Voided'),('refunded','Refunded')]
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 business=models.ForeignKey('businesses.Business',on_delete=models.PROTECT,related_name='sales')
 branch=models.ForeignKey("businesses.Branch",on_delete=models.PROTECT,related_name="sales")
 cashier=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name="sales",null=True,blank=True)
 customer=models.ForeignKey(Customer,on_delete=models.PROTECT,related_name="sales",null=True,blank=True)
 receipt_number=models.CharField(max_length=50,null=True,blank=True)
 status=models.CharField(max_length=20,choices=STATUS_CHOICES,default="draft")
 subtotal=models.DecimalField(max_digits=12,decimal_places=2,default=0)
 discount_amount=models.DecimalField(max_digits=12,decimal_places=2,default=0,validators=[MinValueValidator(0)])
 tax_amount=models.DecimalField(max_digits=12,decimal_places=2,default=0)
 total_amount=models.DecimalField(max_digits=12,decimal_places=2,default=0)
 notes=models.TextField(blank=True)
 created_at=models.DateTimeField(auto_now_add=True)
 updated_at=models.DateTimeField(auto_now=True)
 checkout_key=models.UUIDField(null=True,unique=True,blank=True,editable=False)
 checkout_payload_hash=models.CharField(max_length=64,blank=True,editable=False)
 class Meta:
  ordering=["-created_at"]
  constraints=[models.UniqueConstraint(fields=["business","receipt_number"],name="unique_receipt_number_per_business")]
  
  def __str__(self):
   return self.receipt_number or f"sale {self.id}"

class SaleItem(models.Model):
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 sale=models.ForeignKey(Sale,on_delete=models.PROTECT,related_name="sale_items")
 product=models.ForeignKey("inventory.Product",on_delete=models.PROTECT,related_name="sale_items")
 product_name=models.CharField(max_length=200)
 sku=models.CharField(max_length=100)
 quantity=models.DecimalField(max_digits=12,decimal_places=3,validators=[MinValueValidator(0.001)])
 unit_price=models.DecimalField(max_digits=12,decimal_places=2,validators=[MinValueValidator(0)])
 discount_Amount=models.DecimalField(max_digits=12,decimal_places=2,default=0,validators=[MinValueValidator(0)])
 tax_Amount=models.DecimalField(max_digits=12,decimal_places=2,default=0,validators=[MinValueValidator(0)])
 line_total=models.DecimalField(max_digits=12,decimal_places=2,default=0)
 created_at=models.DateTimeField(auto_now_add=True)
 class Meta:
  ordering=["created_at"]
 def __str__(self):
  return f'{self.product_name} * {self.quantity}'
