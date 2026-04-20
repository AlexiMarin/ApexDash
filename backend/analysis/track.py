"""
Paso 1: Trazar el circuito usando coordenadas GPS
"""
import duckdb
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import numpy as np
from pathlib import Path


def load_track_data(db_path: str) -> dict:
    """Carga los datos necesarios para trazar el circuito"""
    con = duckdb.connect(db_path, read_only=True)
    
    data = {
        "lat": con.execute('SELECT value FROM "GPS Latitude"').fetchdf()["value"].values,
        "lon": con.execute('SELECT value FROM "GPS Longitude"').fetchdf()["value"].values,
        "speed": con.execute('SELECT value FROM "Ground Speed"').fetchdf()["value"].values,
        "lap_dist": con.execute('SELECT value FROM "Lap Dist"').fetchdf()["value"].values,
        "throttle": con.execute('SELECT value FROM "Throttle Pos"').fetchdf()["value"].values,
        "brake": con.execute('SELECT value FROM "Brake Pos"').fetchdf()["value"].values,
    }
    
    # Metadata
    meta = con.execute('SELECT * FROM metadata').fetchdf()
    meta_dict = dict(zip(meta["key"], meta["value"]))
    data["metadata"] = meta_dict
    
    con.close()
    return data


def plot_track_basic(data: dict, save_path: str = None):
    """Trazado básico del circuito"""
    fig, ax = plt.subplots(figsize=(12, 10))
    
    ax.plot(data["lon"], data["lat"], "b-", linewidth=0.5, alpha=0.3)
    ax.scatter(data["lon"], data["lat"], c="blue", s=1, alpha=0.5)
    
    # Marcar inicio/fin
    ax.scatter(data["lon"][0], data["lat"][0], c="green", s=100, marker="o", label="Start", zorder=5)
    ax.scatter(data["lon"][-1], data["lat"][-1], c="red", s=100, marker="s", label="End", zorder=5)
    
    ax.set_xlabel("Longitude (local)")
    ax.set_ylabel("Latitude (local)")
    ax.set_title(f"Track Layout: {data['metadata'].get('TrackName', 'Unknown')}")
    ax.legend()
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved: {save_path}")
    plt.show()


def plot_track_colored_by_speed(data: dict, save_path: str = None):
    """Trazado coloreado por velocidad"""
    fig, ax = plt.subplots(figsize=(14, 10))
    
    # Convertir velocidad de m/s a km/h
    speed_kmh = data["speed"] * 3.6
    
    # Necesitamos alinear los datos (pueden tener diferentes frecuencias)
    # Usamos el mínimo de puntos
    n_points = min(len(data["lat"]), len(speed_kmh))
    
    # Resamplear si es necesario
    if len(speed_kmh) != len(data["lat"]):
        indices = np.linspace(0, len(speed_kmh) - 1, n_points).astype(int)
        speed_plot = speed_kmh[indices]
    else:
        speed_plot = speed_kmh[:n_points]
    
    lat = data["lat"][:n_points]
    lon = data["lon"][:n_points]
    
    # Crear scatter plot coloreado
    scatter = ax.scatter(lon, lat, c=speed_plot, cmap="RdYlGn", s=3, alpha=0.8)
    
    # Colorbar
    cbar = plt.colorbar(scatter, ax=ax, label="Speed (km/h)")
    
    # Línea base
    ax.plot(lon, lat, "k-", linewidth=0.3, alpha=0.2)
    
    ax.set_xlabel("Longitude (local)")
    ax.set_ylabel("Latitude (local)")
    ax.set_title(f"Speed Map: {data['metadata'].get('TrackName', 'Unknown')}")
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.3)
    
    # Stats
    stats_text = f"Max: {speed_plot.max():.1f} km/h\nMin: {speed_plot.min():.1f} km/h\nAvg: {speed_plot.mean():.1f} km/h"
    ax.text(0.02, 0.98, stats_text, transform=ax.transAxes, fontsize=10,
            verticalalignment="top", bbox=dict(boxstyle="round", facecolor="white", alpha=0.8))
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved: {save_path}")
    plt.show()


def plot_track_colored_by_inputs(data: dict, save_path: str = None):
    """Trazado coloreado por throttle/brake"""
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    
    n_points = min(len(data["lat"]), len(data["throttle"]), len(data["brake"]))
    
    lat = data["lat"][:n_points]
    lon = data["lon"][:n_points]
    
    # Resamplear throttle y brake
    if len(data["throttle"]) != n_points:
        indices = np.linspace(0, len(data["throttle"]) - 1, n_points).astype(int)
        throttle = data["throttle"][indices]
        brake = data["brake"][indices]
    else:
        throttle = data["throttle"][:n_points]
        brake = data["brake"][:n_points]
    
    # Throttle map
    ax1 = axes[0]
    scatter1 = ax1.scatter(lon, lat, c=throttle, cmap="Greens", s=3, alpha=0.8, vmin=0, vmax=100)
    ax1.plot(lon, lat, "k-", linewidth=0.3, alpha=0.2)
    plt.colorbar(scatter1, ax=ax1, label="Throttle %")
    ax1.set_title("Throttle Map")
    ax1.set_aspect("equal")
    ax1.grid(True, alpha=0.3)
    
    # Brake map
    ax2 = axes[1]
    scatter2 = ax2.scatter(lon, lat, c=brake, cmap="Reds", s=3, alpha=0.8, vmin=0, vmax=100)
    ax2.plot(lon, lat, "k-", linewidth=0.3, alpha=0.2)
    plt.colorbar(scatter2, ax=ax2, label="Brake %")
    ax2.set_title("Brake Map")
    ax2.set_aspect("equal")
    ax2.grid(True, alpha=0.3)
    
    fig.suptitle(f"Input Maps: {data['metadata'].get('TrackName', 'Unknown')}", fontsize=14)
    
    plt.tight_layout()
    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"Saved: {save_path}")
    plt.show()


def main():
    # Encontrar archivo DuckDB más reciente
    # Buscar en múltiples ubicaciones posibles
    possible_paths = [
        Path(__file__).parent.parent.parent / "samples",  # lmutry/samples
        Path(__file__).parent.parent / "samples",          # backend/samples
        Path.cwd() / "samples",                            # cwd/samples
    ]
    
    samples_dir = None
    for p in possible_paths:
        if p.exists():
            samples_dir = p
            break
    
    if not samples_dir:
        print("No se encontró el directorio samples/")
        return
    
    db_files = sorted(samples_dir.glob("*.duckdb"))
    
    if not db_files:
        print("No se encontraron archivos .duckdb en samples/")
        return
    
    db_path = str(db_files[-1])
    print(f"Usando: {db_files[-1].name}\n")
    
    # Cargar datos
    print("Cargando datos...")
    data = load_track_data(db_path)
    
    print(f"Track: {data['metadata'].get('TrackName')}")
    print(f"Car: {data['metadata'].get('CarName')}")
    print(f"Driver: {data['metadata'].get('DriverName')}")
    print(f"Puntos GPS: {len(data['lat'])}")
    print()
    
    # Crear directorio de output
    output_dir = samples_dir.parent / "output"
    output_dir.mkdir(exist_ok=True)
    
    # Generar visualizaciones
    print("Generando trazado básico...")
    plot_track_basic(data, str(output_dir / "track_basic.png"))
    
    print("\nGenerando mapa de velocidad...")
    plot_track_colored_by_speed(data, str(output_dir / "track_speed.png"))
    
    print("\nGenerando mapas de inputs...")
    plot_track_colored_by_inputs(data, str(output_dir / "track_inputs.png"))
    
    print("\n✅ Completado! Imágenes guardadas en output/")


if __name__ == "__main__":
    main()
