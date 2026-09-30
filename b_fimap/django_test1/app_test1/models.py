from django.db import models
from django.contrib.gis.db import models as gis_models

class plane_now(models.Model):
    icao24 = models.CharField(max_length=18, primary_key=True)
    callsign = models.CharField(max_length=18, blank=True, null=True)
    origin_country = models.CharField(max_length=36, blank=True, null=True)
    time_position = models.DateTimeField(blank=True, null=True)
    last_contact = models.DateTimeField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)
    latitude = models.FloatField(blank=True, null=True)
    baro_altitude = models.FloatField(blank=True, null=True)
    on_ground = models.BooleanField(blank=True, null=True)
    velocity = models.FloatField(blank=True, null=True)
    true_track = models.FloatField(blank=True, null=True)
    vertical_rate = models.FloatField(blank=True, null=True)
    sensors = models.TextField(blank=True, null=True)  # Django 中没有直接对应的数组类型，这里使用 TextField 代替
    geo_altitude = models.FloatField(blank=True, null=True)
    squawk = models.CharField(max_length=14, blank=True, null=True)
    spi = models.BooleanField(blank=True, null=True)
    position_source = models.CharField(max_length=20, blank=True, null=True)
    geom = gis_models.PointField(srid=4326, blank=True, null=True)

    class Meta:
        db_table = 'plane_now'


class PlaneTrack(models.Model):
    callsign = models.CharField(max_length=18)
    origin_country = models.CharField(max_length=36)
    time_position = models.DateTimeField()
    last_contact = models.DateTimeField()
    longitude = models.FloatField()
    latitude = models.FloatField()
    baro_altitude = models.FloatField(null=True, blank=True)
    on_ground = models.BooleanField(null=True, blank=True)
    velocity = models.FloatField(null=True, blank=True)
    true_track = models.FloatField(null=True, blank=True)
    vertical_rate = models.FloatField(null=True, blank=True)
    sensors = models.TextField(null=True, blank=True)  # Django 中没有直接对应的数组类型，这里使用 TextField 代替
    geo_altitude = models.FloatField(null=True, blank=True)
    squawk = models.CharField(max_length=14, null=True, blank=True)
    spi = models.BooleanField(null=True, blank=True)
    position_source = models.CharField(max_length=20, null=True, blank=True)
    geom = gis_models.PointField(srid=4326, null=True, blank=True)

    class Meta:
        abstract = False

class airport(models.Model):
    name = models.CharField(max_length=36, blank=True, null=True)
    type = models.CharField(max_length=18, blank=True, null=True)
    ident = models.CharField(primary_key=True, max_length=255)
    iso_region = models.CharField(max_length=18, blank=True, null=True)
    iso_country = models.CharField(max_length=18, blank=True, null=True)
    municipality = models.CharField(max_length=36, blank=True, null=True)
    geometry = gis_models.PointField(srid=4326, blank=True, null=True)

    class Meta:
        db_table = 'eu_airport'


class ASP(models.Model):
    id = models.CharField(max_length=36, primary_key=True)
    name = models.CharField(max_length=36, blank=True, null=True)
    updatedAt = models.DateTimeField(blank=True, null=True)
    type = models.IntegerField(blank=True, null=True)
    icaoClass = models.IntegerField(blank=True, null=True)
    activity = models.IntegerField(blank=True, null=True)
    country = models.CharField(max_length=36, blank=True, null=True)
    upperLimit = models.TextField(blank=True, null=True)  # Django 中没有直接对应的数组类型，这里使用 TextField 代替
    lowerLimit = models.TextField(blank=True, null=True)
    geometry = gis_models.PolygonField(srid=4326, blank=True, null=True)

    class Meta:
        db_table = 'germany_asp'

