"""
DuckDB telemetry reader.

Core function  → load_lap_data()
  Opens a session file, locates the lap boundaries via GPS Time (100 Hz),
  loads any set of channels and resamples them all to 10 Hz (GPS rate).

Channel kinds
  • single  – table has a single `value` column  (e.g. "Ground Speed")
  • multi   – table has value1-4 columns, one per wheel FL/FR/RL/RR
              (e.g. "TyresRubberTemp", "Brakes Temp")
  • event   – sparse rows with a `ts` + `value`; forward-filled to 10 Hz
              (e.g. "ABS", "Gear", "FrontFlapActivated")

All functions are synchronous – run them in a thread pool from async code.
"""
import duckdb
import numpy as np
from pathlib import Path


WHEEL_KEYS = ("FL", "FR", "RL", "RR")


# ── Low-level helpers ────────────────────────────────────────

def _resample(arr: np.ndarray, target_len: int) -> np.ndarray:
    """Linear interpolation to `target_len` points."""
    if len(arr) == 0:
        return np.full(target_len, np.nan)
    if len(arr) == target_len:
        return arr
    x_src = np.linspace(0, 1, len(arr))
    x_dst = np.linspace(0, 1, target_len)
    return np.interp(x_dst, x_src, arr)


def _ffill_events(ts_col: np.ndarray, val_col: np.ndarray,
                  gps_time: np.ndarray) -> np.ndarray:
    """Forward-fill a sparse event channel onto the GPS time grid (100 Hz)."""
    out = np.full(len(gps_time), np.nan)
    for i, ts in enumerate(gps_time):
        mask = ts_col <= ts
        if mask.any():
            out[i] = val_col[mask][-1]
    return out


# ── Main loader ──────────────────────────────────────────────

def load_lap_data(
    file_path: str | Path,
    ts_start: float,
    ts_end: float,
    single: dict[str, str] | None = None,
    multi: dict[str, str] | None = None,
    events: dict[str, str] | None = None,
) -> dict[str, np.ndarray | dict[str, np.ndarray]]:
    """
    Load and resample telemetry channels for one lap.

    Parameters
    ----------
    file_path  : path to .duckdb file
    ts_start   : lap start timestamp (seconds, from `Lap` table)
    ts_end     : lap end timestamp
    single     : {alias: table_name}  – tables with a single `value` column
    multi      : {alias: table_name}  – tables with value1-4 columns (per wheel)
    events     : {alias: table_name}  – sparse event tables, forward-filled

    Returns
    -------
    dict where each value is either:
      • np.ndarray  (single / event channels)
      • {"FL": np.ndarray, "FR": ..., "RL": ..., "RR": ...}  (multi channels)
    """
    single = single or {}
    multi = multi or {}
    events = events or {}

    con = duckdb.connect(str(file_path), read_only=True)
    try:
        # ── Reference grid: GPS Time (100 Hz) ────────────────
        gps_time_full = con.execute('SELECT value FROM "GPS Time"').fetchdf()["value"].values
        n_gps_full = len(gps_time_full)  # at 100 Hz per-sample (10 Hz GPS has n_gps_full/10 pts)

        # Lap slice indices (in 100 Hz space)
        i100_start = int(np.argmin(np.abs(gps_time_full - ts_start)))
        i100_end = int(np.argmin(np.abs(gps_time_full - ts_end)))
        gps_time_lap = gps_time_full[i100_start:i100_end]

        # 10 Hz equivalent slice
        i10_start = i100_start // 10
        i10_end = i100_end // 10
        n_lap = max(i10_end - i10_start, 1)

        result: dict = {}

        # ── Single-value channels ─────────────────────────────
        for alias, table in single.items():
            raw = con.execute(f'SELECT value FROM "{table}"').fetchdf()["value"].values
            # Scale indices to this channel's sample rate
            n_raw = len(raw)
            ch_start = int(i100_start * n_raw / n_gps_full)
            ch_end = int(i100_end * n_raw / n_gps_full)
            lap_slice = raw[ch_start:ch_end]
            result[alias] = lap_slice

        # ── Multi-value channels (4 wheels) ───────────────────
        for alias, table in multi.items():
            df = con.execute(
                f'SELECT value1, value2, value3, value4 FROM "{table}"'
            ).fetchdf()
            n_raw = len(df)
            ch_start = int(i100_start * n_raw / n_gps_full)
            ch_end = int(i100_end * n_raw / n_gps_full)
            wheels = {}
            for col, key in zip(["value1", "value2", "value3", "value4"], WHEEL_KEYS):
                raw = df[col].values
                sliced = raw[ch_start:ch_end] if n_raw >= ch_end else raw
                wheels[key] = _resample(sliced.astype(float), n_lap)
            result[alias] = wheels

        # ── Event channels (forward-fill) ─────────────────────
        for alias, table in events.items():
            df = con.execute(f'SELECT ts, value FROM "{table}"').fetchdf()
            ts_ev = df["ts"].values
            val_ev = df["value"].values
            filled_100hz = _ffill_events(ts_ev, val_ev, gps_time_lap)
            # downsample to 10 Hz by taking every 10th sample
            filled_10hz = filled_100hz[::10][:n_lap]
            result[alias] = filled_10hz

        # ── Resample single channels to n_lap ────────────────
        for alias in single:
            arr = result[alias]
            if len(arr) != n_lap:
                result[alias] = _resample(arr.astype(float), n_lap)

    finally:
        con.close()

    return result


# ── Utility ──────────────────────────────────────────────────

def get_tables(file_path: str | Path) -> list[str]:
    con = duckdb.connect(str(file_path), read_only=True)
    try:
        return [t[0] for t in con.execute("SHOW TABLES").fetchall()]
    finally:
        con.close()

