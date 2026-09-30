"""Import an OurAirports-compatible airports.csv into the local SQLite database."""
import csv
from pathlib import Path
from urllib.request import urlretrieve

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from flight_api.models import Airport

OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
DEFAULT_BBOX = (34.0, -12.0, 72.0, 40.0)  # Europe and the Mediterranean.


class Command(BaseCommand):
    help = "Import airport points from an OurAirports-compatible CSV, optionally downloading it into data/imports/."

    def add_arguments(self, parser):
        parser.add_argument("--file", help="Path to a CSV with ident,name,type,iso_country,municipality,latitude_deg,longitude_deg columns")
        parser.add_argument("--download", action="store_true", help="Download the official OurAirports airports.csv into data/imports/ before importing")
        parser.add_argument("--bbox", default=",".join(map(str, DEFAULT_BBOX)), help="lamin,lomin,lamax,lomax")
        parser.add_argument("--limit", type=int, default=5000, help="Maximum airports to import after bounding-box filtering")

    def handle(self, *args, **options):
        try:
            lamin, lomin, lamax, lomax = map(float, options["bbox"].split(","))
        except ValueError as error:
            raise CommandError("--bbox must be lamin,lomin,lamax,lomax") from error
        target = Path(options["file"]) if options["file"] else Path(settings.BASE_DIR) / "data" / "imports" / "ourairports_airports.csv"
        if options["download"]:
            target.parent.mkdir(parents=True, exist_ok=True)
            self.stdout.write("Downloading OurAirports CSV…")
            try:
                urlretrieve(OURAIRPORTS_URL, target)  # nosec B310: fixed HTTPS data source.
            except Exception as error:
                raise CommandError(f"Airport download failed: {error}") from error
        if not target.exists():
            raise CommandError("CSV does not exist. Provide --file or run with --download.")

        imported = 0
        with target.open(encoding="utf-8", newline="") as source:
            for row in csv.DictReader(source):
                if imported >= options["limit"]:
                    break
                try:
                    latitude, longitude = float(row["latitude_deg"]), float(row["longitude_deg"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not (lamin <= latitude <= lamax and lomin <= longitude <= lomax):
                    continue
                ident = (row.get("ident") or "").strip()
                if not ident:
                    continue
                Airport.objects.update_or_create(
                    ident=ident,
                    defaults={"name": (row.get("name") or ident)[:128], "airport_type": (row.get("type") or "unknown")[:32], "country": (row.get("iso_country") or "")[:2], "municipality": (row.get("municipality") or "")[:64], "latitude": latitude, "longitude": longitude},
                )
                imported += 1
        self.stdout.write(self.style.SUCCESS(f"Imported {imported} airports from {target}."))
