"""
Paso 1b: Trazar el circuito con linea de carrera real
- GPS trace coloreado por velocidad / lateral / throttle / brake
- Bordes de pista calculados desde la linea central suavizada
- Escala geografica real: M_PER_DEG_LAT / M_PER_DEG_LON
"""
import duckdb
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

M_PER_DEG_LAT = 111_320
M_PER_DEG_LON = 111_320 * np.cos(np.radians(60.0))


def load_track_data(db_path):
    con = duckdb.connect(db_path, read_only=True)
    data = {
        "lat":          con.execute('SELECT value FROM "GPS Latitude"').fetchdf()["value"].values,
        "lon":          con.execute('SELECT value FROM "GPS Longitude"').fetchdf()["value"].values,
        "speed_ms":     con.execute('SELECT value FROM "Ground Speed"').fetchdf()["value"].values,
        "lap_dist":     con.execute('SELECT value FROM "Lap Dist"').fetchdf()["value"].values,
        "throttle":     con.execute('SELECT value FROM "Throttle Pos"').fetchdf()["value"].values,
        "brake":        con.execute('SELECT value FROM "Brake Pos"').fetchdf()["value"].values,
        "path_lateral": con.execute('SELECT value FROM "Path Lateral"').fetchdf()["value"].values,
        "track_edge":   con.execute('SELECT value FROM "Track Edge"').fetchdf()["value"].values,
    }
    meta = con.execute("SELECT * FROM metadata").fetchdf()
    data["metadata"] = dict(zip(meta["key"], meta["value"]))
    # GPS Time (100 Hz) — para mapear timestamps de eventos a índices GPS (10 Hz)
    data["gps_time"] = con.execute('SELECT value FROM "GPS Time"').fetchdf()["value"].values
    data["sector_events"] = con.execute('SELECT * FROM "Current Sector"').fetchdf()
    con.close()

    # Different channels may have different sample rates — resample everything to GPS length
    n_gps = len(data["lat"])
    for key in ("speed_ms", "lap_dist", "throttle", "brake", "path_lateral", "track_edge"):
        arr = data[key]
        if len(arr) != n_gps:
            x_src = np.linspace(0, 1, len(arr))
            x_dst = np.linspace(0, 1, n_gps)
            data[key] = np.interp(x_dst, x_src, arr)

    return data


def get_sector_markers(data):
    """Devuelve posicion GPS de cada cruce de sector (una vuelta representativa).
    Current Sector: value=1 S1, value=2 S2, value=0 S3/SF
    """
    gps_time = data["gps_time"]   # 100 Hz
    n_gps = len(data["lat"])      # 10 Hz

    def ts_to_idx(ts):
        idx_100 = int(np.argmin(np.abs(gps_time - ts)))
        return min(idx_100 // 10, n_gps - 1)

    labels = {2: "S1/S2", 0: "S2/S3", 1: "S/F"}
    colors = {"S1/S2": "#00cfff", "S2/S3": "#ff9500", "S/F": "#00ff88"}

    # Usamos la segunda ocurrencia de cada tipo (vuelta 2, mas limpia)
    counts = {}
    markers = {}
    for _, row in data["sector_events"].iterrows():
        v = int(row["value"])
        counts[v] = counts.get(v, 0) + 1
        if counts[v] == 2:
            idx = ts_to_idx(row["ts"])
            markers[v] = {
                "label": labels.get(v, f"S{v}"),
                "color": colors.get(labels.get(v, ""), "white"),
                "idx": idx,
            }
    return list(markers.values())


def compute_centerline(data):
    dlon_m = np.gradient(data["lon"]) * M_PER_DEG_LON
    dlat_m = np.gradient(data["lat"]) * M_PER_DEG_LAT
    mag = np.sqrt(dlon_m**2 + dlat_m**2) + 1e-12
    dlon_m /= mag
    dlat_m /= mag

    # Normal perpendicular izquierda
    nx_deg =  dlat_m / M_PER_DEG_LON
    ny_deg = -dlon_m / M_PER_DEG_LAT

    pl = data["path_lateral"]
    center_lon = data["lon"] - pl * nx_deg
    center_lat = data["lat"] - pl * ny_deg

    # Recalcular normales sobre la linea central
    dlon_m2 = np.gradient(center_lon) * M_PER_DEG_LON
    dlat_m2 = np.gradient(center_lat) * M_PER_DEG_LAT
    mag2 = np.sqrt(dlon_m2**2 + dlat_m2**2) + 1e-12
    dlon_m2 /= mag2
    dlat_m2 /= mag2

    return {
        "center_lon": center_lon,
        "center_lat": center_lat,
        "nx_deg":  dlat_m2 / M_PER_DEG_LON,
        "ny_deg": -dlon_m2 / M_PER_DEG_LAT,
    }


def build_edges(cl, data):
    half_w = float(np.clip(np.percentile(np.abs(data["track_edge"]), 95), 5.0, 10.0))
    left_lon  = cl["center_lon"] + half_w * cl["nx_deg"]
    left_lat  = cl["center_lat"] + half_w * cl["ny_deg"]
    right_lon = cl["center_lon"] - half_w * cl["nx_deg"]
    right_lat = cl["center_lat"] - half_w * cl["ny_deg"]
    return left_lon, left_lat, right_lon, right_lat, half_w


def plot_track_map(data, cl, colorby="speed", save_path=None):
    cfgs = {
        "speed":    dict(values=data["speed_ms"] * 3.6, cmap="RdYlGn",    label="Speed (km/h)",          vmin=None, vmax=None),
        "lateral":  dict(values=data["path_lateral"],   cmap="coolwarm_r", label="Lateral (m) izq<->der", vmin=-10,  vmax=10),
        "throttle": dict(values=data["throttle"],        cmap="Greens",     label="Throttle (%)",          vmin=0,    vmax=100),
        "brake":    dict(values=data["brake"],           cmap="Reds",       label="Brake (%)",             vmin=0,    vmax=100),
    }
    cfg = cfgs.get(colorby, cfgs["speed"])
    left_lon, left_lat, right_lon, right_lat, half_w = build_edges(cl, data)
    sector_markers = get_sector_markers(data)

    fig, ax = plt.subplots(figsize=(20, 16), facecolor="#1a1a2e")
    ax.set_facecolor("#1a1a2e")

    poly_lon = np.concatenate([left_lon, right_lon[::-1], [left_lon[0]]])
    poly_lat = np.concatenate([left_lat, right_lat[::-1], [left_lat[0]]])
    ax.fill(poly_lon, poly_lat, color="#555", alpha=0.6, zorder=1)
    ax.plot(left_lon,  left_lat,  color="white", linewidth=0.8, alpha=0.9, zorder=2)
    ax.plot(right_lon, right_lat, color="white", linewidth=0.8, alpha=0.9, zorder=2)
    ax.plot(cl["center_lon"], cl["center_lat"], color="yellow", linestyle="--",
            linewidth=0.4, alpha=0.5, zorder=3)

    sc = ax.scatter(data["lon"], data["lat"], c=cfg["values"], cmap=cfg["cmap"],
                    s=0.8, alpha=1.0, zorder=4, vmin=cfg["vmin"], vmax=cfg["vmax"])

    cbar = plt.colorbar(sc, ax=ax, fraction=0.025, pad=0.02)
    cbar.set_label(cfg["label"], color="white", fontsize=10)
    cbar.ax.yaxis.set_tick_params(color="white")
    plt.setp(cbar.ax.yaxis.get_ticklabels(), color="white")

    # Marcadores de sector
    for sm in sector_markers:
        i = sm["idx"]
        nx, ny = cl["nx_deg"][i], cl["ny_deg"][i]
        cx, cy = cl["center_lon"][i], cl["center_lat"][i]
        lx1, ly1 = cx + half_w * nx, cy + half_w * ny
        lx2, ly2 = cx - half_w * nx, cy - half_w * ny
        ax.plot([lx1, lx2], [ly1, ly2], color=sm["color"], linewidth=3, zorder=8)
        ax.text(lx1, ly1, sm["label"], color=sm["color"], fontsize=11,
                fontweight="bold", zorder=9, ha="center", va="bottom",
                bbox=dict(facecolor="#00000099", edgecolor="none", pad=2))

    ax.scatter(data["lon"][0], data["lat"][0], c="lime", s=200, marker="o",
               edgecolors="white", linewidth=2, zorder=10, label="Start/Finish")

    meta = data["metadata"]
    speed_kmh = data["speed_ms"] * 3.6
    info = (
        f"Driver: {meta.get('DriverName', '')}\n"
        f"Car: {meta.get('CarName', '')}\n"
        f"Max: {speed_kmh.max():.0f} km/h  Avg: {speed_kmh.mean():.0f} km/h\n"
        f"Track width est.: {half_w * 2:.1f} m"
    )
    ax.text(0.01, 0.99, info, transform=ax.transAxes, fontsize=9, color="white",
            va="top", bbox=dict(facecolor="#00000090", edgecolor="none", pad=5))

    ax.set_title(
        f"{meta.get('TrackName', 'Track')}  -  {colorby.capitalize()} map",
        color="white", fontsize=14, pad=12,
    )
    ax.set_aspect("equal")
    ax.tick_params(colors="gray")
    for sp in ax.spines.values():
        sp.set_edgecolor("#555")
    ax.legend(facecolor="#333", edgecolor="none", labelcolor="white", fontsize=9)

    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=450, facecolor=fig.get_facecolor())
        print(f"  Saved: {save_path}")
    plt.close(fig)


def main():
    possible = [
        Path(__file__).parent.parent.parent / "samples",
        Path(__file__).parent.parent / "samples",
        Path.cwd() / "samples",
    ]
    samples_dir = next((p for p in possible if p.exists()), None)
    if not samples_dir:
        print("No samples/ encontrado")
        return

    db_files = sorted(samples_dir.glob("*.duckdb"))
    if not db_files:
        print("Sin archivos .duckdb")
        return

    print(f"Usando: {db_files[-1].name}\n")
    data = load_track_data(str(db_files[-1]))
    print(f"Track:   {data['metadata'].get('TrackName')}")
    print(f"Car:     {data['metadata'].get('CarName')}")
    print(f"Driver:  {data['metadata'].get('DriverName')}")
    print(f"Lateral: {data['path_lateral'].min():.1f}m  a  {data['path_lateral'].max():.1f}m\n")

    print("Calculando linea central...")
    cl = compute_centerline(data)

    output_dir = samples_dir.parent / "output"
    output_dir.mkdir(exist_ok=True)

    for ch in ["speed", "lateral", "throttle", "brake"]:
        print(f"Generando mapa: {ch}...")
        plot_track_map(data, cl, colorby=ch,
                       save_path=str(output_dir / f"track_{ch}.png"))

    print("\nListo!")


if __name__ == "__main__":
    main()
