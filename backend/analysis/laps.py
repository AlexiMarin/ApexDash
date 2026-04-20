"""
Paso 2: Extraer vueltas individuales
- Segmenta todos los canales de telemetría por vuelta
- Calcula tiempos de sector
- Filtra vueltas inválidas (pit lap, incompletas)
"""
import duckdb
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np
from pathlib import Path


# ---------------------------------------------------------------------------
# Carga
# ---------------------------------------------------------------------------

CHANNELS = {
    "lat":           "GPS Latitude",
    "lon":           "GPS Longitude",
    "speed_ms":      "Ground Speed",
    "lap_dist":      "Lap Dist",
    "throttle":      "Throttle Pos",
    "brake":         "Brake Pos",
    "steering":      "Steering Pos",
    "gear":          "Gear",
    "rpm":           "Engine RPM",
    "path_lateral":  "Path Lateral",
    "g_lat":         "G Force Lat",
    "g_lon":         "G Force Long",
}


def load_session(db_path: str) -> dict:
    con = duckdb.connect(db_path, read_only=True)

    data = {}
    for key, table in CHANNELS.items():
        data[key] = con.execute(f'SELECT value FROM "{table}"').fetchdf()["value"].values

    data["gps_time"]      = con.execute('SELECT value FROM "GPS Time"').fetchdf()["value"].values
    data["lap_events"]    = con.execute('SELECT * FROM "Lap"').fetchdf()
    data["sector_events"] = con.execute('SELECT * FROM "Current Sector"').fetchdf()
    data["in_pits"]       = con.execute('SELECT * FROM "In Pits"').fetchdf()

    meta = con.execute("SELECT * FROM metadata").fetchdf()
    data["metadata"] = dict(zip(meta["key"], meta["value"]))
    con.close()

    # Resamplear todos los canales al mismo número de puntos que GPS Lat (10 Hz)
    n_gps = len(data["lat"])
    for key in CHANNELS:
        if key in ("lat", "lon"):
            continue
        arr = data[key]
        if len(arr) != n_gps:
            x_src = np.linspace(0, 1, len(arr))
            x_dst = np.linspace(0, 1, n_gps)
            data[key] = np.interp(x_dst, x_src, arr)

    return data


# ---------------------------------------------------------------------------
# Helpers de indexado
# ---------------------------------------------------------------------------

def ts_to_idx10(ts: float, gps_time: np.ndarray) -> int:
    """Convierte un timestamp (s) al índice del array GPS (10 Hz)."""
    idx_100 = int(np.argmin(np.abs(gps_time - ts)))
    return min(idx_100 // 10, len(gps_time) // 10 - 1)


# ---------------------------------------------------------------------------
# Extracción de vueltas
# ---------------------------------------------------------------------------

def extract_laps(data: dict) -> list[dict]:
    """
    Retorna una lista de dicts, uno por vuelta, con:
    - num: número de vuelta
    - idx_start, idx_end: índices en el array GPS (10 Hz)
    - ts_start, ts_end: timestamps en segundos
    - duration: duración en segundos
    - valid: True si es una vuelta volante completa
    - reason: motivo de invalidez (si aplica)
    - sector_times: dict con s1, s2, s3 en segundos (None si no disponible)
    - channels: dict de arrays con la telemetría de esa vuelta
    """
    gps_time   = data["gps_time"]
    lap_events = data["lap_events"]
    sect_ev    = data["sector_events"]
    n_gps      = len(data["lat"])
    ts_end_session = gps_time[-1]

    # Construir lista de (ts_start, ts_end, lap_num)
    lap_boundaries = []
    for i, row in lap_events.iterrows():
        ts_start = row["ts"]
        ts_end   = lap_events.iloc[i + 1]["ts"] if i + 1 < len(lap_events) else ts_end_session
        lap_boundaries.append((float(ts_start), float(ts_end), int(row["value"])))

    # Detectar si el auto estaba en pits durante una vuelta
    pit_ts = data["in_pits"][data["in_pits"]["value"] == 1]["ts"].values  # ts donde In Pits=1

    laps = []
    for ts_start, ts_end, lap_num in lap_boundaries:
        idx_start = ts_to_idx10(ts_start, gps_time)
        idx_end   = ts_to_idx10(ts_end,   gps_time)
        duration  = ts_end - ts_start
        is_last   = (ts_end >= ts_end_session - 0.1)

        # Validación
        valid  = True
        reason = None

        # 1. Vuelta incompleta (sesión termina antes del S/F)
        if is_last:
            valid  = False
            reason = "incomplete"

        # 2. Pit lap: el auto salió de pits durante esta vuelta
        pit_during = any(ts_start <= t <= ts_end for t in pit_ts)
        if pit_during:
            valid  = False
            reason = "pit_lap"

        # 3. Duración sospechosamente corta (<60s para Monza ~114s)
        if duration < 60:
            valid  = False
            reason = "too_short"

        # Tiempos de sector (de los eventos Current Sector dentro de esta vuelta)
        sector_times = _calc_sector_times(ts_start, ts_end, sect_ev)

        # Slices de canales
        channels = {k: data[k][idx_start:idx_end] for k in CHANNELS}

        laps.append({
            "num":          lap_num,
            "ts_start":     ts_start,
            "ts_end":       ts_end,
            "idx_start":    idx_start,
            "idx_end":      idx_end,
            "duration":     duration,
            "valid":        valid,
            "reason":       reason,
            "sector_times": sector_times,
            "channels":     channels,
        })

    return laps


def _calc_sector_times(ts_lap_start, ts_lap_end, sect_ev) -> dict:
    """Calcula tiempos de S1, S2, S3 usando los cruces de sector dentro de la vuelta."""
    # Filtrar eventos de este lapso
    mask = (sect_ev["ts"] >= ts_lap_start) & (sect_ev["ts"] <= ts_lap_end)
    evs  = sect_ev[mask].sort_values("ts")

    result = {"s1": None, "s2": None, "s3": None, "total": None}

    # Buscar cruces: value cambia 1→2 (fin S1), 2→0 (fin S2), 0→1 (fin S3 = inicio nueva vuelta)
    ts_s1_end = ts_s2_end = ts_s3_end = None
    prev_val = None
    prev_ts  = ts_lap_start

    for _, row in evs.iterrows():
        v  = int(row["value"])
        ts = float(row["ts"])
        if prev_val == 1 and v == 2:
            ts_s1_end = ts
        elif prev_val == 2 and v == 0:
            ts_s2_end = ts
        elif prev_val == 0 and v == 1:
            ts_s3_end = ts
        prev_val = v

    # Si la vuelta cierra en el inicio de la siguiente (value=1 al TS final de la vuelta)
    if ts_s3_end is None and ts_s2_end is not None:
        ts_s3_end = ts_lap_end

    if ts_s1_end:
        result["s1"] = ts_s1_end - ts_lap_start
    if ts_s1_end and ts_s2_end:
        result["s2"] = ts_s2_end - ts_s1_end
    if ts_s2_end and ts_s3_end:
        result["s3"] = ts_s3_end - ts_s2_end
    if result["s1"] and result["s2"] and result["s3"]:
        result["total"] = result["s1"] + result["s2"] + result["s3"]

    return result


# ---------------------------------------------------------------------------
# Visualización
# ---------------------------------------------------------------------------

def fmt_time(seconds: float | None) -> str:
    if seconds is None:
        return "–"
    m = int(seconds // 60)
    s = seconds % 60
    return f"{m}:{s:06.3f}"


def plot_lap_overview(laps: list[dict], metadata: dict, save_path: str = None):
    """Panel 1: velocidad vs distancia de todas las vueltas superpuestas."""
    valid_laps = [l for l in laps if l["valid"]]

    fig, axes = plt.subplots(3, 1, figsize=(18, 14), facecolor="#1a1a2e",
                             gridspec_kw={"hspace": 0.45})
    colors = ["#00cfff", "#ff9500", "#ff4ecd", "#00ff88", "#fff700"]

    for ax in axes:
        ax.set_facecolor("#12122a")
        ax.tick_params(colors="gray")
        for sp in ax.spines.values():
            sp.set_edgecolor("#333")

    # Panel 1: Velocidad
    ax = axes[0]
    for i, lap in enumerate(valid_laps):
        ch    = lap["channels"]
        dist  = ch["lap_dist"]
        speed = ch["speed_ms"] * 3.6
        ax.plot(dist, speed, color=colors[i % len(colors)], linewidth=0.8,
                label=f"Vuelta {lap['num']}  ({fmt_time(lap['duration'])})")
    ax.set_ylabel("Velocidad (km/h)", color="white")
    ax.set_title("Velocidad vs Distancia", color="white", fontsize=11)
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=9)
    ax.grid(True, alpha=0.15)

    # Panel 2: Throttle + Brake
    ax = axes[1]
    for i, lap in enumerate(valid_laps):
        ch   = lap["channels"]
        dist = ch["lap_dist"]
        ax.plot(dist, ch["throttle"], color="#00dd44", linewidth=0.6, alpha=0.8,
                label=f"Throttle V{lap['num']}" if i == 0 else "")
        ax.plot(dist, -ch["brake"],  color="#ff4444", linewidth=0.6, alpha=0.8,
                label=f"Brake V{lap['num']}" if i == 0 else "")
    ax.set_ylabel("Throttle / Brake (%)", color="white")
    ax.set_title("Inputs (throttle ↑ / brake ↓)", color="white", fontsize=11)
    ax.axhline(0, color="#555", linewidth=0.5)
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=9)
    ax.grid(True, alpha=0.15)

    # Panel 3: RPM
    ax = axes[2]
    for i, lap in enumerate(valid_laps):
        ch   = lap["channels"]
        dist = ch["lap_dist"]
        ax.plot(dist, ch["rpm"], color=colors[i % len(colors)], linewidth=0.6)
    ax.set_xlabel("Distancia de vuelta (m)", color="white")
    ax.set_ylabel("RPM", color="white")
    ax.set_title("RPM", color="white", fontsize=11)
    ax.grid(True, alpha=0.15)

    track  = metadata.get("TrackName", "")
    driver = metadata.get("DriverName", "")
    fig.suptitle(f"{track}  —  {driver}", color="white", fontsize=14, y=0.98)

    if save_path:
        plt.savefig(save_path, dpi=300, facecolor=fig.get_facecolor())
        print(f"  Saved: {save_path}")
    plt.close(fig)


def print_lap_summary(laps: list[dict]):
    print(f"\n{'Vuelta':>6}  {'Dur.':>9}  {'S1':>8}  {'S2':>8}  {'S3':>8}  {'Estado'}")
    print("-" * 62)
    for lap in laps:
        st = lap["sector_times"]
        status = "✅ válida" if lap["valid"] else f"❌ {lap['reason']}"
        print(
            f"  {lap['num']:>4}  {fmt_time(lap['duration']):>9}  "
            f"{fmt_time(st['s1']):>8}  {fmt_time(st['s2']):>8}  "
            f"{fmt_time(st['s3']):>8}  {status}"
        )
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

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
    data = load_session(str(db_files[-1]))

    print(f"Track:  {data['metadata'].get('TrackName')}")
    print(f"Car:    {data['metadata'].get('CarName')}")
    print(f"Driver: {data['metadata'].get('DriverName')}")

    laps = extract_laps(data)
    print_lap_summary(laps)

    output_dir = samples_dir.parent / "output"
    output_dir.mkdir(exist_ok=True)

    valid = [l for l in laps if l["valid"]]
    if valid:
        plot_lap_overview(laps, data["metadata"],
                          save_path=str(output_dir / "laps_overview.png"))
        print(f"Vueltas válidas: {len(valid)}")
        for lap in valid:
            st = lap["sector_times"]
            print(f"  Vuelta {lap['num']}: {fmt_time(lap['duration'])}  "
                  f"(S1={fmt_time(st['s1'])}  S2={fmt_time(st['s2'])}  S3={fmt_time(st['s3'])})")
    else:
        print("No hay vueltas válidas en este archivo.")

    print("\nListo!")


if __name__ == "__main__":
    main()
