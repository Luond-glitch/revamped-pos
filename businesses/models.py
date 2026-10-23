import uuid
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.text import slugify

# Create your models here.
class Business(models.Model):
 INDUSTRY_CHOICES=[("retail","Retail"),("restaurant","Restaurant"),("wholesale","Wholesale"),("pharmacy","Pharmacy"),("other","Other"),]
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 name=models.CharField(max_length=200)
 slug=models.SlugField(max_length=220,unique=True,blank=True)
 industry=models.CharField(max_length=30,choices=INDUSTRY_CHOICES,default="retail")
 currency=models.CharField(max_length=3,default="kes")
 tax_rate=models.DecimalField(max_digits=5,decimal_places=2,default=0)
 is_active=models.BooleanField(default=True)
 created_at=models.DateTimeField(auto_now_add=True)
 updated_at=models.DateTimeField(auto_now=True)
 def save_work(self,*args,**kwargs):
  if not self.slug:
   base_slug=slugify(self.name) or "business"
   slug=base_slug
   counter=1

   while  Business.objects.filter(slug=slug).exclude(pk=self.pk).exists():
    slug=f'{base_slug}-{counter}'
  super().save(*args,**kwargs)
 def __str__(self):
  return self.name
class Branch(models.Model):
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 business=models.ForeignKey(Business,on_delete=models.CASCADE,related_name="branches")
 name=models.CharField(max_length=150)
 code=models.CharField(max_length=30)
 email=models.CharField(max_length=255,blank=True)
 phone_number=models.CharField(max_length=30,blank=True)
 is_active=models.BooleanField(default=True)
 created_at=models.DateTimeField(auto_now_add=True)
 
 class Meta:
  constraints=[models.UniqueConstraint(fields=["business","code"],name="unique_branch_code_per_business")]
  ordering=["name"]
 def __str__(self):
  return f'{self.business.name}-{self.name}'
class Membership(models.Model):
 ROLE_CHOICES=[
("owner","Owner"),("admin","Admin"),("manager","Manager"),("cashier","Cashier"),("stock_manager","Stock Manager"),("accountant","Accountant")]
 id=models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
 business=models.ForeignKey(Business,on_delete=models.CASCADE,related_name="business_memberships")
 user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.CASCADE,related_name="business_membership")
 role=models.CharField(max_length=30,choices=ROLE_CHOICES)
 is_active=models.BooleanField(default=True)
 joined_at=models.DateTimeField(auto_now_add=True)

 class Meta:
  constraints=[models.UniqueConstraint(fields=["business","user"],name="unique_user_membership_per_business")]
 
 def __str__(self):
  return f"{self.user.username} - {self.business.name}- ({self.role})"
 
class BranchAssignment(models.Model):
 membership=models.ForeignKey(Membership,on_delete=models.CASCADE,related_name="staff_assignment")
 branch=models.ForeignKey(Branch,on_delete=models.CASCADE,related_name="staff_assignments")
 assigned_at=models.DateTimeField(auto_now_add=True)
 class Meta:
  constraints=[models.UniqueConstraint(fields=["membership","branch"],name="unique_branch_assignment")]
 def clean(self):
  if (self.membership_id and self.branch_id and self.membership.business_id !=self.branch.business_id):
   raise ValidationError("The branch must belong to the membership business.")
 def __str__(self):
  return f"{self.membership} - {self.branch.name}"
