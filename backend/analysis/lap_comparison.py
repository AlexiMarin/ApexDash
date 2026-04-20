"""
Paso 4: Comparación de vueltas
- Overlay de telemetría de dos vueltas alineadas por distancia
- Delta de tiempo acumulado (quién va más rápido y dónde)
- Zonas de ganancia / pérdida coloreadas
- Análisis por sector
"""
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import matplotlib.ticker as mticker
import numpy as np
from scipy.interpolate import interp1d

sys.path.insert(0, str(Path(__file__).parent))
from laps import load_session, extract_laps, fmt_time


# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

BG_MAIN   = "#1a1a2e"
BG_AXES   = "#12122a"
GRID_ALPHA = 0.15
COLOR_A   = "#00cfff"   # Vuelta de referencia
COLOR_B   = "#ff9500"   # Vuelta de comparación
COLOR_GAIN = "#00dd44"  # B más rápido que A (delta negativo)
COLOR_LOSS = "#ff4444"  # B más lento que A (delta positivo)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resample_to_dist(lap: dict, n_out: int = 1000) -> dict:
    """
    Remuestrea todos los canales de la vuelta a n_out puntos equidistantes
    en el dominio de distancia [0, max_dist].
    Retorna dict con arrays de longitud n_out + 'dist_common'.
    """
    ch       = lap["channels"]
    raw_dist = ch["lap_dist"].astype(float)

    # Eliminar duplicados y asegurar monotonicidad
    _, unique_idx = np.unique(raw_dist, return_index=True)
    raw_dist = raw_dist[unique_idx]

    dist_common = np.linspace(raw_dist[0], raw_dist[-1], n_out)
    resampled   = {"dist_common": dist_common}

    for key, arr in ch.items():
        arr_u = arr[unique_idx].astype(float)
        resampled[key] = np.interp(dist_common, raw_dist, arr_u)

    # Tiempo acumulado desde el inicio de la vuelta (integral de 1/velocidad)
    # v en m/s; evitar divisiones por cero (<0.1 m/s)
    v_ms = np.maximum(resampled["speed_ms"], 0.1)
    d_arr = np.diff(dist_common, prepend=dist_common[0])
    dt    = d_arr / v_ms                           # dt[i] = tiempo para cubrir d[i]
    resampled["cum_time"] = np.cumsum(dt)          # tiempo acumulado desde d=0

    return resampled


def _delta_time(ra: dict, rb: dict) -> np.ndarray:
    """
    Delta = cum_time_B - cum_time_A (a eje X común).
    Positivo → B pierde tiempo respecto a A.
    Negativo → B gana tiempo respecto a A.
    """
    return rb["cum_time"] - ra["cum_time"]


# ---------------------------------------------------------------------------
# Tabla de sector summary
# ---------------------------------------------------------------------------

def _sector_table(lap_a: dict, lap_b: dict) -> list[str]:
    """Devuelve líneas de texto con la comparativa por sector."""
    st_a = lap_a["sector_times"]
    st_b = lap_b["sector_times"]
    lines = []
    for s in ("s1", "s2", "s3"):
        a_t = st_a.get(s)
        b_t = st_b.get(s)
        if a_t is None or b_t is None:
            continue
        diff   = b_t - a_t
        winner = "B" if diff < 0 else "A" if diff > 0 else "="
        sign   = "+" if diff > 0 else ""
        lines.append(f"{s.upper()}  A={fmt_time(a_t)}  B={fmt_time(b_t)}  "
                     f"({sign}{diff:.3f}s)  {'← B' if diff < 0 else '← A' if diff > 0 else '='}")
    tot_a = lap_a["duration"]
    tot_b = lap_b["duration"]
    diff  = tot_b - tot_a
    sign  = "+" if diff > 0 else ""
    lines.append(f"TOT  A={fmt_time(tot_a)}  B={fmt_time(tot_b)}  ({sign}{diff:.3f}s)")
    return lines


# ---------------------------------------------------------------------------
# Figura principal
# ---------------------------------------------------------------------------

def plot_comparison(lap_a: dict, lap_b: dict, save_path: str = None,
                    label_a: str = None, label_b: str = None):
    """
    5 paneles de comparación:
      0 — Delta de tiempo (B − A) acumulado con zonas coloreadas
      1 — Velocidad overlay
      2 — Throttle overlay
      3 — Brake overlay
      4 — Steering overlay
    """
    n_pts = 1200   # puntos de remuestreo
    ra    = _resample_to_dist(lap_a, n_pts)
    rb    = _resample_to_dist(lap_b, n_pts)
    dist  = ra["dist_common"]
    delta = _delta_time(ra, rb)

    label_a = label_a or f"Vuelta {lap_a['num']}  {fmt_time(lap_a['duration'])}"
    label_b = label_b or f"Vuelta {lap_b['num']}  {fmt_time(lap_b['duration'])}"

    # ------------------------------------------------------------------
    # Layout
    # ------------------------------------------------------------------
    heights = [2.5, 3, 2, 2, 2]
    fig = plt.figure(figsize=(20, 18), facecolor=BG_MAIN)
    gs  = gridspec.GridSpec(5, 1, figure=fig, hspace=0.55, height_ratios=heights)
    axes = [fig.add_subplot(gs[i]) for i in range(5)]

    for ax in axes:
        ax.set_facecolor(BG_AXES)
        ax.tick_params(colors="gray", labelsize=8)
        for sp in ax.spines.values():
            sp.set_edgecolor("#333")
        ax.grid(True, alpha=GRID_ALPHA)
        ax.set_xlim(dist[0], dist[-1])

    for ax in axes[:-1]:
        ax.set_xticklabels([])
    axes[-1].set_xlabel("Distancia de vuelta (m)", color="gray", fontsize=9)

    def ylabel(ax, txt):
        ax.set_ylabel(txt, color="white", fontsize=9)

    def title(ax, txt):
        ax.set_title(txt, color="white", fontsize=10, pad=4, loc="left")

    # ------------------------------------------------------------------
    # 0 — Delta de tiempo
    # ------------------------------------------------------------------
    ax = axes[0]
    ax.axhline(0, color="#555", linewidth=0.8, linestyle="--")
    ax.fill_between(dist, delta, 0,
                    where=(delta <= 0), color=COLOR_GAIN, alpha=0.55,
                    label=f"B más rápido")
    ax.fill_between(dist, delta, 0,
                    where=(delta > 0),  color=COLOR_LOSS, alpha=0.55,
                    label=f"A más rápido")
    ax.plot(dist, delta, color="white", linewidth=1.0, alpha=0.9)

    # Anotar delta final
    final_delta = delta[-1]
    sign = "+" if final_delta > 0 else ""
    ax.annotate(f"Δ final: {sign}{final_delta:.3f}s",
                xy=(dist[-1], final_delta),
                xytext=(-10, 8 if final_delta >= 0 else -14),
                textcoords="offset points",
                color="white", fontsize=9, ha="right",
                bbox=dict(boxstyle="round,pad=0.3", fc="#222", ec="none", alpha=0.8))

    ylabel(ax, "Δ tiempo (s)")
    title(ax, f"Delta acumulado   {label_b} − {label_a}")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper left")

    # ------------------------------------------------------------------
    # 1 — Velocidad
    # ------------------------------------------------------------------
    ax = axes[1]
    ax.plot(dist, ra["speed_ms"] * 3.6, color=COLOR_A, linewidth=0.9, label=label_a)
    ax.plot(dist, rb["speed_ms"] * 3.6, color=COLOR_B, linewidth=0.9, label=label_b,
            linestyle="--")
    # Sombrear diferencia de velocidad
    v_a = ra["speed_ms"] * 3.6
    v_b = rb["speed_ms"] * 3.6
    ax.fill_between(dist, v_a, v_b, where=(v_b > v_a), color=COLOR_B, alpha=0.15)
    ax.fill_between(dist, v_a, v_b, where=(v_b < v_a), color=COLOR_A, alpha=0.15)
    ylabel(ax, "Velocidad (km/h)")
    title(ax, "Velocidad")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right")

    # ------------------------------------------------------------------
    # 2 — Throttle
    # ------------------------------------------------------------------
    ax = axes[2]
    ax.plot(dist, ra["throttle"], color=COLOR_A, linewidth=0.9, label=label_a)
    ax.plot(dist, rb["throttle"], color=COLOR_B, linewidth=0.9, label=label_b,
            linestyle="--", alpha=0.85)
    ax.set_ylim(-5, 105)
    ax.yaxis.set_major_locator(mticker.MultipleLocator(25))
    ylabel(ax, "Throttle (%)")
    title(ax, "Throttle")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right")

    # ------------------------------------------------------------------
    # 3 — Brake
    # ------------------------------------------------------------------
    ax = axes[3]
    ax.plot(dist, ra["brake"], color=COLOR_A, linewidth=0.9, label=label_a)
    ax.plot(dist, rb["brake"], color=COLOR_B, linewidth=0.9, label=label_b,
            linestyle="--", alpha=0.85)
    ax.set_ylim(-5, 105)
    ax.yaxis.set_major_locator(mticker.MultipleLocator(25))
    ylabel(ax, "Brake (%)")
    title(ax, "Brake")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right")

    # ------------------------------------------------------------------
    # 4 — Steering
    # ------------------------------------------------------------------
    ax = axes[4]
    ax.plot(dist, ra["steering"], color=COLOR_A, linewidth=0.9, label=label_a)
    ax.plot(dist, rb["steering"], color=COLOR_B, linewidth=0.9, label=label_b,
            linestyle="--", alpha=0.85)
    ax.axhline(0, color="#555", linewidth=0.5, linestyle="--")
    ylabel(ax, "Volante (%)")
    title(ax, "Steering")
    ax.legend(facecolor="#222", edgecolor="none", labelcolor="white", fontsize=8,
              loc="upper right")

    # ------------------------------------------------------------------
    # Título + tabla de sectores
    # ------------------------------------------------------------------
    sector_lines = _sector_table(lap_a, lap_b)
    sector_text  = "   ".join(sector_lines)
    fig.suptitle(
        f"Comparación   {label_a}  vs  {label_b}\n{sector_text}",
        color="white", fontsize=11, y=0.997, va="top",
        fontfamily="monospace",
    )

    # ------------------------------------------------------------------
    # Guardar / mostrar
    # ------------------------------------------------------------------
    if save_path:
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(save_path, dpi=200, bbox_inches="tight", facecolor=BG_MAIN)
        print(f"Guardado: {save_path}")
    else:
        plt.show()

    plt.close(fig)


# ---------------------------------------------------------------------------
# Segunda figura: mapa del circuito con delta
# ---------------------------------------------------------------------------

def plot_delta_map(lap_a: dict, lap_b: dict, data: dict, save_path: str = None,
                   label_a: str = None, label_b: str = None):
    """
    Mapa del circuito coloreado por delta de tiempo (B−A).
    Verde = B más rápido; Rojo = A más rápido.
    """
    n_pts = 1200
    ra    = _resample_to_dist(lap_a, n_pts)
    rb    = _resample_to_dist(lap_b, n_pts)
    delta = _delta_time(ra, rb)

    label_a = label_a or f"Vuelta {lap_a['num']}"
    label_b = label_b or f"Vuelta {lap_b['num']}"

    # GPS de la vuelta A (más puntos = mejor trazado)
    lat_a = ra["lat"]
    lon_a = ra["lon"]

    M_LAT = 111320
    M_LON = 55660   # ~60°N

    x = (lon_a - lon_a.mean()) * M_LON
    y = (lat_a - lat_a.mean()) * M_LAT

    fig, ax = plt.subplots(figsize=(14, 12), facecolor=BG_MAIN)
    ax.set_facecolor(BG_AXES)
    ax.set_aspect("equal")
    ax.axis("off")

    # Rango del delta para normalizar colores
    d_abs = np.abs(delta).max()
    d_abs = max(d_abs, 0.05)   # evitar división por cero

    # Pintar segmento a segmento
    cmap_gain = plt.cm.RdYlGn   # verde = A más lento (B gana), rojo = B más lento
    norm = plt.Normalize(-d_abs, d_abs)

    for i in range(len(x) - 1):
        c = cmap_gain(norm(-delta[i]))   # negativo → B más rápido → verde
        ax.plot(x[i:i+2], y[i:i+2], color=c, linewidth=2.5, solid_capstyle="round")

    # Colorbar
    sm = plt.cm.ScalarMappable(cmap=cmap_gain, norm=norm)
    sm.set_array([])
    cbar = fig.colorbar(sm, ax=ax, fraction=0.025, pad=0.02, orientation="vertical")
    cbar.ax.tick_params(colors="gray", labelsize=8)
    cbar.set_label(f"Δ tiempo  {label_a} gana ← 0 → {label_b} gana  (s)",
                   color="white", fontsize=8)
    for sp in cbar.ax.spines.values():
        sp.set_edgecolor("#333")

    # Punto de inicio
    ax.scatter([x[0]], [y[0]], color="white", s=60, zorder=5)
    ax.annotate("S/F", (x[0], y[0]), xytext=(4, 4), textcoords="offset points",
                color="white", fontsize=9)

    final_delta = delta[-1]
    sign = "+" if final_delta > 0 else ""
    ax.set_title(
        f"Delta en circuito   {label_a}  vs  {label_b}\n"
        f"Δ final: {sign}{final_delta:.3f}s",
        color="white", fontsize=11, pad=10
    )

    if save_path:
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(save_path, dpi=200, bbox_inches="tight", facecolor=BG_MAIN)
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
    data = load_session(db_path)
    laps = extract_laps(data)
    meta = data["metadata"]

    print(f"Track: {meta.get('TrackName','')}  |  Car: {meta.get('CarName','')}")
    for lap in laps:
        status = "✅" if lap["valid"] else f"❌ {lap['reason']}"
        print(f"  Vuelta {lap['num']}  {fmt_time(lap['duration'])}  {status}")

    valid = [l for l in laps if l["valid"]]
    if len(valid) < 2:
        # Solo hay una vuelta válida — comparar vuelta 1 (pit lap) vs vuelta 2
        # aunque no sea válida, para que la demo funcione con este dataset
        lap_a = laps[0]
        lap_b = valid[0]
        print("\n⚠  Solo una vuelta válida; comparando Vuelta 1 (pit) vs Vuelta 2 (válida)")
    else:
        lap_a = valid[0]
        lap_b = valid[1]

    label_a = f"V{lap_a['num']} {fmt_time(lap_a['duration'])}"
    label_b = f"V{lap_b['num']} {fmt_time(lap_b['duration'])}"

    print(f"\nComparando {label_a}  vs  {label_b} …")

    plot_comparison(lap_a, lap_b,
                    save_path=str(out_dir / f"comparison_v{lap_a['num']}_v{lap_b['num']}.png"),
                    label_a=label_a, label_b=label_b)

    plot_delta_map(lap_a, lap_b, data,
                   save_path=str(out_dir / f"delta_map_v{lap_a['num']}_v{lap_b['num']}.png"),
                   label_a=label_a, label_b=label_b)
