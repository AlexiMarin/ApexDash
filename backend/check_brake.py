import duckdb, numpy as np
from pathlib import Path

db = sorted(Path("samples").glob("*.duckdb"))[-1]
con = duckdb.connect(str(db), read_only=True)

# Check row counts for all relevant single channels
for ch in ["GPS Latitude", "GPS Longitude", "GPS Time", "Throttle Pos", "Brake Pos", "Ground Speed", "Lap Dist", "Path Lateral", "Track Edge"]:
    r = con.execute(f'SELECT count(*) FROM "{ch}"').fetchone()
    print(f"{ch}: {r[0]} rows")

# Check timing alignment
import sys
sys.path.insert(0, "backend")
from app.duck import load_lap_data

laps = con.execute('SELECT ts, value FROM "Lap" ORDER BY ts').fetchdf()
print(f"\nLaps: {laps.to_string()}")

# Load lap 1 (first full lap)
ts_s, ts_e = float(laps.iloc[0]["ts"]), float(laps.iloc[1]["ts"])
print(f"\nLap1 range: {ts_s} - {ts_e}")

data = load_lap_data(
    db, ts_s, ts_e,
    single={"lat": "GPS Latitude", "lon": "GPS Longitude", "throttle": "Throttle Pos", "brake": "Brake Pos", "lap_dist": "Lap Dist"},
)

for k, v in data.items():
    if isinstance(v, np.ndarray):
        nz = np.sum(~np.isnan(v) & (v > 0))
        print(f"  {k}: len={len(v)} non-zero={nz} min={np.nanmin(v):.2f} max={np.nanmax(v):.2f}")


