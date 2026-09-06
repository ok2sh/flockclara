"""Extract Santa Clara area ALPR cameras from FlockHopper's cameras-us.json.gz.

Source repo: https://github.com/FoggedLens/deflockhopper_maps (MIT).
Camera data originates from OpenStreetMap via DeFlock (ODbL).
Usage: python3 extract_cameras.py <path-to-cameras-us.json.gz> <commit-sha> <commit-date>
"""
import gzip
import json
import math
import os
import sys

# Greater Santa Clara area (Santa Clara County plus fringe)
BBOX = {"min_lat": 36.89, "max_lat": 37.49, "min_lon": -122.21, "max_lon": -121.20}
# Approximate City of Santa Clara bounding box
CITY_BBOX = {"min_lat": 37.32, "max_lat": 37.42, "min_lon": -122.005, "max_lon": -121.925}
CITY_CENTER = {"lat": 37.3541, "lon": -121.9552}


def km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def main(src, commit, commit_date):
    with gzip.open(src, "rt") as f:
        cams = json.load(f)

    out = []
    for c in cams:
        lat, lon = c["lat"], c["lon"]
        if not (BBOX["min_lat"] <= lat <= BBOX["max_lat"] and BBOX["min_lon"] <= lon <= BBOX["max_lon"]):
            continue
        out.append({
            "osm_id": c["osmId"],
            "osm_type": c.get("osmType", "node"),
            "lat": lat,
            "lon": lon,
            "operator": c.get("operator"),
            "brand": c.get("brand"),
            "model": c.get("model"),
            "direction": c.get("direction"),
            "directions": c.get("directions"),
            "zone": c.get("surveillanceZone"),
            "mount": c.get("mountType"),
            "ref": c.get("ref"),
            "start_date": c.get("startDate"),
            "osm_timestamp": c.get("osmTimestamp"),
            "km_from_city_center": round(km(lat, lon, CITY_CENTER["lat"], CITY_CENTER["lon"]), 2),
            "in_city_bbox": (CITY_BBOX["min_lat"] <= lat <= CITY_BBOX["max_lat"]
                             and CITY_BBOX["min_lon"] <= lon <= CITY_BBOX["max_lon"]),
        })
    out.sort(key=lambda c: c["km_from_city_center"])

    doc = {
        "source": {
            "name": "FlockHopper / DeFlock community camera map",
            "repo": "https://github.com/FoggedLens/deflockhopper_maps",
            "commit": commit,
            "commit_date": commit_date,
            "license": "Repo: MIT. Camera data: (c) OpenStreetMap contributors, ODbL 1.0, collected via the DeFlock project.",
            "us_total": len(cams),
        },
        "bbox": BBOX,
        "city_bbox": CITY_BBOX,
        "city_center": CITY_CENTER,
        "count": len(out),
        "cameras": out,
    }
    default_dst = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "public", "data", "cameras.json",
    )
    dst = sys.argv[4] if len(sys.argv) > 4 else default_dst
    with open(dst, "w") as f:
        json.dump(doc, f, ensure_ascii=True, separators=(",", ":"))
    print(f"wrote {dst}: {len(out)} cameras, in_city_bbox={sum(1 for c in out if c['in_city_bbox'])}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
