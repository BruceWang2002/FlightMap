from datetime import timedelta
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from .models import AircraftCurrent, Airport


def feature(geometry, properties):
    return {"type": "Feature", "geometry": geometry, "properties": properties}


def collection(features):
    return {"type": "FeatureCollection", "features": features}


def parse_bbox(value):
    if not value:
        return None
    try:
        west, south, east, north = map(float, value.split(","))
        if west >= east or south >= north:
            raise ValueError
        return west, south, east, north
    except ValueError as error:
        raise ValueError("bbox must be west,south,east,north") from error


@require_GET
def health(request):
    return JsonResponse({"status": "ok", "service": "flight-map-api"})


@require_GET
def aircraft_collection(request):
    try:
        bbox = parse_bbox(request.GET.get("bbox"))
        limit = min(max(int(request.GET.get("limit", "500")), 1), 2000)
    except ValueError as error:
        return JsonResponse({"detail": str(error)}, status=400)
    queryset = AircraftCurrent.objects.all()
    if bbox:
        west, south, east, north = bbox
        queryset = queryset.filter(longitude__gte=west, longitude__lte=east, latitude__gte=south, latitude__lte=north)
    features = [feature({"type": "Point", "coordinates": [item.longitude, item.latitude]}, {"icao24": item.icao24, "callsign": item.callsign, "origin_country": item.origin_country, "altitude_m": item.altitude_m, "velocity_ms": item.velocity_ms, "track_deg": item.track_deg, "vertical_rate_ms": item.vertical_rate_ms, "observed_at": item.observed_at.isoformat()}) for item in queryset[:limit]]
    return JsonResponse(collection(features))


@require_GET
def aircraft_track(request, icao24):
    aircraft = AircraftCurrent.objects.filter(icao24=icao24.lower()).first()
    if not aircraft:
        return JsonResponse({"detail": "Aircraft not found"}, status=404)
    try:
        hours = min(max(int(request.GET.get("hours", "6")), 1), 168)
        limit = min(max(int(request.GET.get("limit", "600")), 1), 2000)
    except ValueError:
        return JsonResponse({"detail": "hours must be an integer"}, status=400)
    positions = aircraft.positions.filter(observed_at__gte=timezone.now() - timedelta(hours=hours))[:limit]
    features = [feature({"type": "Point", "coordinates": [item.longitude, item.latitude]}, {"altitude_m": item.altitude_m, "track_deg": item.track_deg, "velocity_ms": item.velocity_ms, "observed_at": item.observed_at.isoformat()}) for item in positions]
    return JsonResponse(collection(features))


@require_GET
def airport_collection(request):
    try:
        bbox = parse_bbox(request.GET.get("bbox"))
        limit = min(max(int(request.GET.get("limit", "1000")), 1), 15000)
    except ValueError as error:
        return JsonResponse({"detail": str(error)}, status=400)
    queryset = Airport.objects.all()
    if bbox:
        west, south, east, north = bbox
        queryset = queryset.filter(longitude__gte=west, longitude__lte=east, latitude__gte=south, latitude__lte=north)
    features = [feature({"type": "Point", "coordinates": [item.longitude, item.latitude]}, {"ident": item.ident, "name": item.name, "type": item.airport_type, "country": item.country, "municipality": item.municipality, "elevation_ft": item.metadata.get("elevation_ft"), "iata_code": item.metadata.get("iata_code"), "scheduled_service": item.metadata.get("scheduled_service")}) for item in queryset[:limit]]
    return JsonResponse(collection(features))
