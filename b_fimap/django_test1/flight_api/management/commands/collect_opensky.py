"""Import current OpenSky state vectors into the normalized MVP schema."""
import json
import os
from datetime import datetime, timezone as datetime_timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from flight_api.models import AircraftCurrent, AircraftPosition

API_URL = "https://opensky-network.org/api/states/all"
TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
DEFAULT_BBOX = (47.0, 5.0, 56.0, 16.0)  # Central Europe: costs fewer API credits than a global request.
DEMO_ICAO24 = ("4ca123", "3c65ab", "406a12", "4851f5", "4b1809")


def archive_track_points(icao24, headers):
    """Persist the OpenSky track path and return its valid point count."""
    url = f"{API_URL.replace('/states/all', '/tracks/all')}?{urlencode({'icao24': icao24, 'time': 0})}"
    payload = fetch_json(url, headers=headers)
    path = [point for point in payload.get("path") or [] if len(point) >= 3 and point[1] is not None and point[2] is not None]
    # A one-to-nine-point line is visually misleading; retain only usable paths.
    if len(path) < 10:
        return len(path)
    aircraft = AircraftCurrent.objects.get(icao24=icao24)
    for point in path:
        observed_at = datetime.fromtimestamp(point[0], tz=datetime_timezone.utc)
        AircraftPosition.objects.update_or_create(
            aircraft=aircraft, observed_at=observed_at,
            defaults={"latitude": point[1], "longitude": point[2], "altitude_m": point[3] if len(point) > 3 else None, "track_deg": point[4] if len(point) > 4 else None, "velocity_ms": None},
        )
    return len(path)


def fetch_json(url, *, data=None, headers=None):
    request = Request(url, data=data, headers=headers or {})
    with urlopen(request, timeout=30) as response:  # nosec B310: fixed HTTPS endpoints only
        return json.loads(response.read().decode("utf-8"))


def get_access_token():
    client_id = os.getenv("OPENSKY_CLIENT_ID")
    client_secret = os.getenv("OPENSKY_CLIENT_SECRET")
    if not (client_id and client_secret):
        return None
    body = urlencode({"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret}).encode()
    return fetch_json(TOKEN_URL, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})["access_token"]


class Command(BaseCommand):
    help = "Fetch current OpenSky state vectors for a bounded area and store current state plus track points."

    def add_arguments(self, parser):
        parser.add_argument("--bbox", default=",".join(map(str, DEFAULT_BBOX)), help="lamin,lomin,lamax,lomax")
        parser.add_argument("--limit", type=int, default=500, help="Maximum valid aircraft states to store")
        parser.add_argument("--tracks", type=int, default=0, help="Archive complete tracks for this many returned aircraft (uses additional OpenSky requests)")

    def handle(self, *args, **options):
        try:
            lamin, lomin, lamax, lomax = map(float, options["bbox"].split(","))
        except ValueError as error:
            raise CommandError("--bbox must be lamin,lomin,lamax,lomax") from error
        if lamin >= lamax or lomin >= lomax:
            raise CommandError("bbox minimums must be less than maximums")

        query = urlencode({"lamin": lamin, "lomin": lomin, "lamax": lamax, "lomax": lomax})
        headers = {}
        token = get_access_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            payload = fetch_json(f"{API_URL}?{query}", headers=headers)
        except Exception as error:
            raise CommandError(f"OpenSky request failed: {error}") from error

        # Do not mix deterministic seed records with real-time aircraft in the UI.
        AircraftCurrent.objects.filter(icao24__in=DEMO_ICAO24).delete()
        stored = 0
        stored_icao24 = []
        for state in payload.get("states") or []:
            if stored >= options["limit"]:
                break
            icao24, callsign, country, time_position, last_contact, longitude, latitude, altitude, _, velocity, track, vertical_rate = state[:12]
            if latitude is None or longitude is None or not icao24:
                continue
            timestamp = last_contact or time_position or payload.get("time")
            observed_at = datetime.fromtimestamp(timestamp, tz=datetime_timezone.utc) if timestamp else timezone.now()
            aircraft, _ = AircraftCurrent.objects.update_or_create(
                icao24=icao24.lower(),
                defaults={"callsign": (callsign or "").strip(), "origin_country": country or "", "latitude": latitude, "longitude": longitude, "altitude_m": altitude, "velocity_ms": velocity, "track_deg": track, "vertical_rate_ms": vertical_rate, "observed_at": observed_at},
            )
            AircraftPosition.objects.get_or_create(
                aircraft=aircraft, observed_at=observed_at,
                defaults={"latitude": latitude, "longitude": longitude, "altitude_m": altitude, "track_deg": track, "velocity_ms": velocity},
            )
            stored_icao24.append(aircraft.icao24)
            stored += 1
        mode = "OAuth" if token else "anonymous"
        self.stdout.write(self.style.SUCCESS(f"Stored {stored} OpenSky states ({mode} mode)."))
        if options["tracks"] <= 0:
            return
        archived = 0
        for icao24 in stored_icao24[:options["tracks"]]:
            try:
                points = archive_track_points(icao24, headers)
            except Exception as error:  # A single unavailable aircraft should not discard the state-vector update.
                self.stderr.write(self.style.WARNING(f"Could not archive {icao24}: {error}"))
                continue
            if points >= 10:
                archived += 1
                self.stdout.write(f"Archived {points} real trajectory points for {icao24}.")
            else:
                self.stderr.write(self.style.WARNING(f"Skipped short trajectory for {icao24}: {points} point(s)."))
        self.stdout.write(self.style.SUCCESS(f"Archived {archived} usable trajectories (at least 10 points)."))
