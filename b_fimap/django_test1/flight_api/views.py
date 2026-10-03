from datetime import timedelta
import hashlib
import math
from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from .models import AircraftCurrent, Airport
from .weather import forecast


@require_GET
def weather_forecast(request):
    try:
        latitude = float(request.GET.get('latitude', ''))
        longitude = float(request.GET.get('longitude', ''))
        if not math.isfinite(latitude) or not math.isfinite(longitude) or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise ValueError
    except (ValueError, TypeError):
        return JsonResponse({'detail': '请输入有效经纬度。'}, status=400)
    # Per-process limit protects the public upstream from repeated uncached queries.
    ip_hash = hashlib.sha256(request.META.get('REMOTE_ADDR', '').encode()).hexdigest()[:16]
    rate_key = 'weather-rate:' + ip_hash
    if not cache.add(rate_key, 1, 60):
        try:
            if cache.incr(rate_key) > 20:
                response = JsonResponse({'detail': '天气查询过于频繁，请一分钟后重试。'}, status=429)
                response['Retry-After'] = '60'
                return response
        except ValueError:
            cache.set(rate_key, 1, 60)
    try:
        return JsonResponse(forecast(latitude, longitude))
    except (OSError, ValueError, TypeError, AttributeError):
        return JsonResponse({'detail': '天气服务暂时不可用，请稍后重试。'}, status=503)


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
    reference = request.GET.get('reference', 'now')
    if reference not in ('now', 'latest'):
        return JsonResponse({'detail': 'reference must be now or latest'}, status=400)
    latest = aircraft.positions.order_by('-observed_at').first() if reference == 'latest' else None
    window_end = latest.observed_at if latest else timezone.now()
    # Return the newest N points, ordered forward for rendering. Historical snapshots
    # use their own last observation rather than disappearing after wall-clock time passes.
    positions = list(aircraft.positions.filter(
        observed_at__gte=window_end - timedelta(hours=hours), observed_at__lte=window_end
    ).order_by('-observed_at')[:limit])
    positions.reverse()
    features = [feature({"type": "Point", "coordinates": [item.longitude, item.latitude]}, {"altitude_m": item.altitude_m, "track_deg": item.track_deg, "velocity_ms": item.velocity_ms, "observed_at": item.observed_at.isoformat()}) for item in positions]
    payload = collection(features)
    payload['metadata'] = {'reference': reference, 'window_end': window_end.isoformat()}
    return JsonResponse(payload)


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
    metadata_fields = (
        'elevation_ft', 'iata_code', 'gps_code', 'local_code', 'scheduled_service',
        'iso_region', 'continent', 'home_link', 'wikipedia_link', 'keywords',
        'source', 'source_updated_at',
    )
    features = [feature(
        {'type': 'Point', 'coordinates': [item.longitude, item.latitude]},
        {'ident': item.ident, 'name': item.name, 'type': item.airport_type,
         'country': item.country, 'municipality': item.municipality,
         **{key: item.metadata.get(key) for key in metadata_fields}}
    ) for item in queryset[:limit]]
    return JsonResponse(collection(features))
