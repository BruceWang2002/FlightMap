"""Bounded, cached public surface forecasts; never accept a user-supplied URL."""
import json
import math
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import urlopen

from django.core.cache import cache

CURRENT = ('temperature_2m', 'relative_humidity_2m', 'precipitation', 'cloud_cover',
           'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m')
HOURLY = ('temperature_2m', 'precipitation_probability', 'precipitation', 'visibility',
          'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m')


def numeric(value):
    return value if isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) else None


def utc_time(value):
    if not isinstance(value, str):
        raise ValueError('Missing forecast timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.replace(tzinfo=timezone.utc).isoformat() if parsed.tzinfo is None else parsed.astimezone(timezone.utc).isoformat()


def normalize_forecast(payload, latitude, longitude):
    current = payload.get('current') or {}
    hourly = payload.get('hourly') or {}
    times = hourly.get('time') or []
    if not current.get('time') or not isinstance(times, list) or not times:
        raise ValueError('Incomplete forecast response')
    rows = []
    for index, timestamp in enumerate(times[:24]):
        row = {'time': utc_time(timestamp)}
        for field in HOURLY:
            values = hourly.get(field)
            row[field] = numeric(values[index]) if isinstance(values, list) and index < len(values) else None
        rows.append(row)
    return {
        'location': {'latitude': latitude, 'longitude': longitude},
        'grid_location': {'latitude': numeric(payload.get('latitude')), 'longitude': numeric(payload.get('longitude'))},
        'current': {'time': utc_time(current['time']), **{field: numeric(current.get(field)) for field in CURRENT}},
        'hourly': rows,
        'metadata': {'source': 'Open-Meteo', 'source_url': 'https://open-meteo.com/',
                     'fetched_at': datetime.now(timezone.utc).isoformat(), 'cached': False, 'stale': False,
                     'kind': 'surface_model_forecast',
                     'units': {'temperature': '°C', 'wind_speed': 'm/s', 'precipitation': 'mm',
                               'pressure': 'hPa', 'visibility': 'm'}},
    }


def forecast(latitude, longitude):
    latitude, longitude = round(latitude, 4), round(longitude, 4)
    key = f'weather:v1:{latitude}:{longitude}'
    fresh = cache.get(key)
    if fresh:
        return {**fresh, 'metadata': {**fresh['metadata'], 'cached': True}}
    query = urlencode({'latitude': latitude, 'longitude': longitude,
                       'current': ','.join(CURRENT), 'hourly': ','.join(HOURLY),
                       'forecast_hours': 24, 'timezone': 'GMT', 'wind_speed_unit': 'ms'})
    try:
        with urlopen('https://api.open-meteo.com/v1/forecast?' + query, timeout=8) as response:
            raw = response.read(1_000_001)
        if len(raw) > 1_000_000:
            raise ValueError('Forecast response too large')
        result = normalize_forecast(json.loads(raw), latitude, longitude)
    except (OSError, ValueError, TypeError, AttributeError):
        stale = cache.get(key + ':stale')
        if stale:
            return {**stale, 'metadata': {**stale['metadata'], 'cached': True, 'stale': True}}
        raise
    cache.set(key, result, 600)
    cache.set(key + ':stale', result, 3600)
    return result
