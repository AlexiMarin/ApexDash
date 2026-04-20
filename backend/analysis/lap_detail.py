"""
Paso 3: Análisis detallado de una vuelta
- Velocidad vs distancia
- Inputs: throttle, brake, steering
- RPM y cambios de marcha
- G-forces (lateral y longitudinal)
- Temperaturas de neumáticos y frenos
"""
import sys
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import matplotlib.ticker as mticker
import numpy as np

# Reusar funciones del paso 2
sys.path.insert(0, str(Path(__file__).parent))
from laps import load_session, extract_laps, fmt_time, ts_to_idx10


# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

WHEEL_LABELS = ["FL", "FR", "RL", "RR"]
WHEEL_COLORS = ["#00cfff", "#ff9500", "#00ff88", "#ff4ecd"]

TYRE_COLOR  = "#1a1a2e"   # Fondo oscuro (tema)
BG_MAIN     = "#1a1a2e"
BG_AXES     = "#12122a"
GRID_ALPHA  = 0.15


# ---------------------------------------------------------------------------
# Carga extendida
# ---------------------------------------------------------------------------

def load_extended(db_path: str) -> dict:
    """Carga sesión base y agrega temperaturas de neumáticos y frenos."""
    data = load_session(db_path)
    con  = duckdb.connect(db_path, read_only=True)
    n    = len(data["lat"])   # longitud GPS (10 Hz)

    def load_multi(table: str) -> np.ndarray:
        """Carga tabla 4-columnas y remuestra a n puntos. Retorna (n, 4)."""
        df = con.execute(f'SELECT value1, value2, value3, value4 FROM "{table}"').fetchdf()
        arr = df.values.astype(float)          # shape (rows, 4)
        if len(arr) != n:
            x_src = np.linspace(0, 1, len(arr))
            x_dst = np.linspace(0, 1, n)
            arr   = np.column_stack([np.interp(x_dst, x_src, arr[:, i]) for i in range(4)])
        return arr

    data["tyre_temp"]  = load_multi("TyresRubberTemp")   # (n, 4)  FL FR RL RR
    data["brake_temp"] = load_multi("Brakes Temp")        # (n, 4)  FL FR RL RR
    con.close()
    return data


# ---------------------------------------------------------------------------
# Figura principal
# ---------------------------------------------------------------------------

def plot_lap_detail(lap: dict, data: dict, metadata: dict, save_path: str = None):
    """
    7 paneles apilados para un análisis completo de una vuelta:
      0 — Velocidad (km/h)
      1 — Throttle + Brake (%)
      2 — Steering (% de rango)
      3 — RPM  | Gear (eje derecho)
      4 — G-Forces laterales y longitudinales
      5 — Temperaturas de neumáticos (4 ruedas)
      6 — Temperaturas de frenos (4 ruedas)
    """
    idx_s = lap["idx_start"]
    idx_e = lap["idx_end"]

    ch       = lap["channels"]
    dist     = ch["lap_dist"]
    speed    = ch["speed_ms"] * 3.6

    # Temperaturas: slice del array global (n, 4)
    tyre_temp  = data["tyre_temp"] [idx_s:idx_e, :]
    brake_temp = data["brake_temp"][idx_s:idx_e, :]

    # ------------------------------------------------------------------
    # Layout
    # ------------------------------------------------------------------
    heights = [3, 2, 1.5, 2, 2, 2.5, 2.5]
    fig = plt.figure(figsize=(20, 22), facecolor=BG_MAIN)
    gs  = gridspec.GridSpec(7, 1, figure=fig, hspace=0.60, height_ratios=heights)
    axes = [fig.add_subplot(gs[i]) for i in range(7)]

    for ax in axes:
        ax.set_facecolor(BG_AXES)
        ax.tick_params(colors="gray", labelsize=8)
        for sp in ax.spines.values():
            sp.set_edgecolor("#333")
        ax.grid(True, alpha=GRID_ALPHA)
        ax.set_xlim(dist[0], dist[-1])

    # Etiqueta X solo en el último panel
    for ax in axes[:-1]:
        ax.set_xticklabels([])
    axes[-1].set_xlabel("Distancia de vuelta (m)", color="gray", fontsize=9)

    def ylabel(ax, txt):
        ax.set_ylabel(txt, color="white", fontsize=9)

    def title(ax, txt):
        ax.set_title(txt, color="white", fontsize=10, pad=4, loc="left")

    # ------------------------------------------------------------------
    # 0 — Velocidad
    # ------------------------------------------------------------------
    ax = axes[0]
    ax.plot(dist, speed, color="#00cfff", linewidth=1.0)
    # Sombrear zonas de frenada (brake > 5 %)
    ax.fill_between(dist, speed, where=(ch["brake"] > 5),
                    color="#ff4444", alpha=0.25, label="Frenada")
    ylabel(ax, "Velocidad (km/h)")
    title(ax, "Velocidad")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right")
    # Anotar velocidad máxima
    vmax_idx = int(np.argmax(speed))
    ax.annotate(f"{speed[vmax_idx]:.0f} km/h",
                xy=(dist[vmax_idx], speed[vmax_idx]),
                xytext=(0, 8), textcoords="offset points",
                color="white", fontsize=8, ha="center",
                arrowprops=dict(arrowstyle="-", color="#555", lw=0.8))

    # ------------------------------------------------------------------
    # 1 — Throttle + Brake
    # ------------------------------------------------------------------
    ax = axes[1]
    ax.fill_between(dist, ch["throttle"], alpha=0.7, color="#00dd44", label="Throttle")
    ax.fill_between(dist, ch["brake"],    alpha=0.7, color="#ff4444", label="Brake")
    ax.plot(dist, ch["throttle"], color="#00ff55", linewidth=0.6)
    ax.plot(dist, ch["brake"],    color="#ff6666", linewidth=0.6)
    ax.set_ylim(-5, 105)
    ax.yaxis.set_major_locator(mticker.MultipleLocator(25))
    ylabel(ax, "Pos (%)")
    title(ax, "Throttle / Brake")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right")

    # ------------------------------------------------------------------
    # 2 — Steering
    # ------------------------------------------------------------------
    ax = axes[2]
    steer = ch["steering"]
    ax.plot(dist, steer, color="#ffcc00", linewidth=0.8)
    ax.fill_between(dist, steer, alpha=0.3, color="#ffcc00")
    ax.axhline(0, color="#555", linewidth=0.5, linestyle="--")
    ylabel(ax, "Volante (%)")
    title(ax, "Steering")

    # ------------------------------------------------------------------
    # 3 — RPM + Gear
    # ------------------------------------------------------------------
    ax  = axes[3]
    ax2 = ax.twinx()
    ax2.set_facecolor(BG_AXES)
    ax2.tick_params(colors="gray", labelsize=8)

    ax.plot(dist, ch["rpm"], color="#ff9500", linewidth=0.8, label="RPM")
    ax.set_ylim(0, ch["rpm"].max() * 1.15)
    ylabel(ax, "RPM")
    title(ax, "RPM  /  Marcha")

    # Gear como escalones coloreados por marcha
    gear = ch["gear"].astype(int)
    gear_colors = {1: "#ff4444", 2: "#ff9500", 3: "#ffcc00",
                   4: "#00dd44", 5: "#00cfff", 6: "#aa88ff", 7: "#ff4ecd"}
    prev_g = None
    seg_start = 0
    for j in range(1, len(dist) + 1):
        g = gear[j - 1] if j < len(dist) else None
        if g != prev_g or j == len(dist):
            if prev_g is not None and seg_start < j - 1:
                seg_dist = dist[seg_start:j]
                seg_gear = gear[seg_start:j]
                c = gear_colors.get(int(prev_g), "#888")
                ax2.step(seg_dist, seg_gear, where="post", color=c, linewidth=1.5, alpha=0.9)
            prev_g   = g
            seg_start = j - 1
    ax2.set_ylim(0, 9)
    ax2.yaxis.set_major_locator(mticker.MultipleLocator(1))
    ax2.set_ylabel("Marcha", color="gray", fontsize=9)

    # ------------------------------------------------------------------
    # 4 — G-Forces
    # ------------------------------------------------------------------
    ax = axes[4]
    ax.plot(dist, ch["g_lat"], color="#00cfff", linewidth=0.8, label="G lat")
    ax.plot(dist, ch["g_lon"], color="#ff9500", linewidth=0.8, label="G lon")
    ax.axhline(0, color="#555", linewidth=0.5, linestyle="--")
    ylabel(ax, "G (g)")
    title(ax, "G-Forces")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right")

    # ------------------------------------------------------------------
    # 5 — Temperaturas de neumáticos
    # ------------------------------------------------------------------
    ax = axes[5]
    for i, (lbl, col) in enumerate(zip(WHEEL_LABELS, WHEEL_COLORS)):
        col_data = tyre_temp[:, i]
        ax.plot(dist, col_data, color=col, linewidth=1.2, label=f"{lbl} {col_data.mean():.0f}°C")
    # Expandir y-axis para que la pequeña variación sea visible
    t_min = tyre_temp.min()
    t_max = tyre_temp.max()
    margin = max((t_max - t_min) * 0.5, 5)   # al menos ±5°C de margen
    ax.set_ylim(t_min - margin, t_max + margin)
    ax.yaxis.set_major_locator(mticker.MaxNLocator(5, integer=True))
    ylabel(ax, "T (°C)")
    title(ax, "Temperatura neumáticos (goma)")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right", ncol=4)

    # ------------------------------------------------------------------
    # 6 — Temperaturas de frenos
    # ------------------------------------------------------------------
    ax = axes[6]
    for i, (lbl, col) in enumerate(zip(WHEEL_LABELS, WHEEL_COLORS)):
        col_data = brake_temp[:, i]
        ax.plot(dist, col_data, color=col, linewidth=0.9, label=lbl)
        # Anotar la temperatura máxima de cada rueda
        peak_idx = int(np.argmax(col_data))
        ax.annotate(f"{col_data[peak_idx]:.0f}°",
                    xy=(dist[peak_idx], col_data[peak_idx]),
                    xytext=(0, 5), textcoords="offset points",
                    color=col, fontsize=7, ha="center", va="bottom")
    # Rango de trabajo típico: 200-800°C para LMP/GT
    ax.axhspan(200, 800, alpha=0.07, color="#ffff00", label="rango normal")
    ylabel(ax, "T (°C)")
    title(ax, "Temperatura frenos")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right", ncol=5)

    # ------------------------------------------------------------------
    # Título general
    # ------------------------------------------------------------------
    track  = metadata.get("TrackName", "")
    car    = metadata.get("CarName", "")
    driver = metadata.get("PlayerName", "")
    lap_n  = lap["num"]
    lap_t  = fmt_time(lap["duration"])
    st     = lap["sector_times"]
    sector_str = (f"  S1 {fmt_time(st['s1'])}   S2 {fmt_time(st['s2'])}"
                  f"   S3 {fmt_time(st['s3'])}")

    fig.suptitle(
        f"Vuelta {lap_n}  —  {lap_t}{sector_str}\n"
        f"{track}  |  {car}  |  {driver}",
        color="white", fontsize=12, y=0.995, va="top",
        fontfamily="monospace",
    )

    # ------------------------------------------------------------------
    # Guardar / mostrar
    # ------------------------------------------------------------------
    if save_path:
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(save_path, dpi=200, bbox_inches="tight",
                    facecolor=BG_MAIN)
        print(f"Guardado: {save_path}")
    else:
        plt.show()

    plt.close(fig)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    db_path = str(sorted(Path("/Users/alexi/apps/lmutry/samples").glob("*.duckdb"))[-1])
    out_dir = Path("/Users/alexi/apps/lmutry/output")

    print(f"DB: {Path(db_path).name}")

    data = load_extended(db_path)
    laps = extract_laps(data)

    meta = data["metadata"]
    print(f"Track: {meta.get('TrackName','')}  |  Car: {meta.get('CarName','')}  "
          f"|  Driver: {meta.get('PlayerName','')}")

    for lap in laps:
        status = "✅ válida" if lap["valid"] else f"❌ {lap['reason']}"
        st     = lap["sector_times"]
        print(f"  Vuelta {lap['num']}  {fmt_time(lap['duration'])}  {status}"
              f"  S1={fmt_time(st['s1'])}  S2={fmt_time(st['s2'])}  S3={fmt_time(st['s3'])}")

    # Analizar la primera vuelta válida
    valid_laps = [l for l in laps if l["valid"]]
    if not valid_laps:
        print("No hay vueltas válidas.")
        sys.exit(1)

    lap = valid_laps[0]
    print(f"\nAnalizando vuelta {lap['num']} ({fmt_time(lap['duration'])})…")
    plot_lap_detail(lap, data, meta,
                    save_path=str(out_dir / f"lap_{lap['num']}_detail.png"))
