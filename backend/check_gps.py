"""
Script para analizar datos GPS y metadata
"""
import duckdb

db_file = "samples/Autodromo Nazionale Monza_P_2026-03-31T04_07_26Z.duckdb"
con = duckdb.connect(db_file, read_only=True)

# GPS
lat = con.execute('SELECT * FROM "GPS Latitude"').fetchdf()
lon = con.execute('SELECT * FROM "GPS Longitude"').fetchdf()
lap_dist = con.execute('SELECT * FROM "Lap Dist"').fetchdf()

print(f"GPS Latitude - {len(lat)} puntos")
print(f"  Range: {lat['value'].min():.6f} to {lat['value'].max():.6f}")
print(f"  Delta: {lat['value'].max() - lat['value'].min():.6f}")

print(f"\nGPS Longitude - {len(lon)} puntos")
print(f"  Range: {lon['value'].min():.6f} to {lon['value'].max():.6f}")
print(f"  Delta: {lon['value'].max() - lon['value'].min():.6f}")

print(f"\nLap Dist - {len(lap_dist)} puntos")
print(f"  Range: {lap_dist['value'].min():.1f}m to {lap_dist['value'].max():.1f}m")

# Metadata
print("\n=== METADATA ===")
meta = con.execute('SELECT * FROM metadata').fetchdf()
for _, row in meta.iterrows():
    print(f"  {row['key']}: {row['value']}")

con.close()
