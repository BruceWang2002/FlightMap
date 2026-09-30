"""One-time converter: EU_AP.xlsx -> local GeoJSON airport dataset.

Run with the bundled workspace Python so the Django runtime stays lightweight.
"""
import json
import sys
from pathlib import Path

import pandas as pd


def clean(value):
    return None if pd.isna(value) else value


def main(source_path, target_path):
    frame = pd.read_excel(source_path)
    required = {"ident", "type", "name", "latitude_deg", "longitude_deg"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")
    features = []
    for row in frame.dropna(subset=["ident", "latitude_deg", "longitude_deg"]).to_dict("records"):
        properties = {key: clean(value) for key, value in row.items()}
        properties["ident"] = str(properties["ident"]).strip()
        properties["type"] = str(properties["type"] or "unknown")
        features.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [float(properties.pop("longitude_deg")), float(properties.pop("latitude_deg"))]}, "properties": properties})
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")
    print(f"Converted {len(features)} airport features to {target_path}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
