from django.contrib.auth.models import AbstractUser
from django.db import models
# Create your models here.
class User(AbstractUser):
 phone_number=models.CharField(max_length=30,blank=True)
 def _str_(self):
  return self.username
