from django.http import JsonResponse
from django.utils import timezone

# Create your views here.
def health_check(request):
 return JsonResponse({
 "status":"success",
 "message":"universal POS backend is running",
 "application":"universal POS management system",
  "timestamp":timezone.now().isoformat(),
  })
