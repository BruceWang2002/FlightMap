from django.urls import path
from .views import PlaneNowGeoJSONList

from .views import PlaneTrackList

from .views import AirPortsList

from .views import ASPGeoJSONList

urlpatterns = [
    path('planesnow.geojson/', PlaneNowGeoJSONList.as_view(), name='plane-now-geojson'),
    path('planetracks/', PlaneTrackList.as_view(), name='plane-track-list'),
    path('airports/', AirPortsList.as_view(), name='airports-list'),
    path('asps/',ASPGeoJSONList.as_view(),name='asp-list')
]
