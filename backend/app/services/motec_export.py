"""
MoTeC CSV export service.

Generates a CSV file in the MoTeC i2 "Logged Data" import format, which
can be imported directly via i2 → File → Import CSV.

MoTeC i2 CSV format specification:
  Row 1: "Format"      → "MoTeC CSV Export"
  Row 2: "Venue"       → circuit name
  Row 3: "Vehicle"     → car/vehicle name
  Row 4: "Driver"      → driver name
  Row 5: "Device"      → data logger name
  Row 6: "Comment"     → free text
  Row 7: "Log Date"    → DD/MM/YYYY
  Row 8: "Log Time"    → HH:MM:SS
  Row 9: "Sample Rate" → Hz (uniform for all channels)
  Row 10: blank
  Row 11: channel names header
  Row 12: channel units header
  Row 13+: data rows (one row per sample)

Reference: MoTeC i2 Help → Import/Export → CSV Import Format
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
import numpy as np


# ── Channel definitions ────────────────────────────────────────────────────
# Maps (output_column_name, unit, duckdb_table, kind)
# kind: "single" = one value column, "multi" = value1-4 (FL/FR/RL/RR)

SINGLE_CHANNELS: list[tuple[str, str, str]] = [
    ("Speed",            "km/h",  "Ground Speed"),
    ("Throttle",         "%",     "Throttle Pos"),
    ("Brake",            "%",     "Brake Pos"),
    ("Steering",         "deg",   "Steering Pos"),
    ("RPM",              "rpm",   "Engine RPM"),
    ("G_Lat",            "g",     "G Force Lat"),
    ("G_Lon",            "g",     "G Force Long"),
    ("Lap_Distance",     "m",     "Lap Dist"),
    ("GPS_Latitude",     "deg",   "GPS Latitude"),
    ("GPS_Longitude",    "deg",   "GPS Longitude"),
    ("Water_Temp",       "C",     "Water Temp"),
    ("Oil_Temp",         "C",     "Oil Temp"),
    ("Oil_Pressure",     "kPa",   "Oil Pressure"),
    ("Fuel_Level",       "L",     "Fuel Level"),
    ("Turbo_Boost",      "kPa",   "Manifold Pres"),
]

MULTI_CHANNELS: list[tuple[str, str, str]] = [
    # (prefix, unit, duckdb_table) — generates prefix_FL/FR/RL/RR columns
    ("Tyre_Temp",        "C",     "TyresRubberTemp"),
    ("Tyre_Pressure",    "kPa",   "TyresPressure"),
    ("Brake_Temp",       "C",     "Brakes Temp"),
    ("Susp_Travel",      "mm",    "Suspension Travel"),
]

EVENT_CHANNELS: list[tuple[str, str, str]] = [
    ("Gear",             "",      "Gear"),
    ("ABS",              "",      "ABS"),
    ("TC",               "",      "TC"),
]

WHEEL_SUFFIXES = ("FL", "FR", "RL", "RR")


# ── Core functions ─────────────────────────────────────────────────────────

def _resample(arr: np.ndarray, target_len: int) -> np.ndarray:
    """Linear interpolation to target_len points."""
    if len(arr) == 0:
        return np.full(target_len, np.nan)
    if len(arr) == target_len:
        return arr
    x_src = np.linspace(0, 1, len(arr))
    x_dst = np.linspace(0, 1, target_len)
    return np.interp(x_dst, x_src, arr)


def _ffill(ts_events: np.ndarray, val_events: np.ndarray,
           gps_time_lap: np.ndarray) -> np.ndarray:
    """Forward-fill a sparse event channel onto the lap time grid."""
    out = np.full(len(gps_time_lap), np.nan)
    for i, ts in enumerate(gps_time_lap):
        mask = ts_events <= ts
        if mask.any():
            out[i] = val_events[mask][-1]
    return out


def _load_lap_channels(
    db_path: str | Path,
    ts_start: float,
    ts_end: float,
) -> tuple[int, dict[str, np.ndarray]]:
    """
    Open the DuckDB file and extract all channels for the given lap.

    Returns
    -------
    sample_rate : int
        Samples per second (10 Hz — the GPS rate used as reference grid)
    channels : dict[str, np.ndarray]
        All channels resampled to the same length.
    """
    con = duckdb.connect(str(db_path), read_only=True)
    try:
        # Reference grid at 100 Hz (GPS Time raw)
        gps_time_full = con.execute('SELECT value FROM "GPS Time"').fetchdf()["value"].values
        n_full = len(gps_time_full)

        i_start = int(np.argmin(np.abs(gps_time_full - ts_start)))
        i_end   = int(np.argmin(np.abs(gps_time_full - ts_end)))
        gps_lap = gps_time_full[i_start:i_end]

        # 10 Hz grid for output
        n10_start = i_start // 10
        n10_end   = i_end   // 10
        n_lap     = max(n10_end - n10_start, 1)

        channels: dict[str, np.ndarray] = {}
        existing_tables: set[str] = set(
            row[0] for row in con.execute("SHOW TABLES").fetchall()
        )

        def _slice_single(table: str) -> np.ndarray | None:
            if table not in existing_tables:
                return None
            raw = con.execute(f'SELECT value FROM "{table}"').fetchdf()["value"].values
            n_raw = len(raw)
            s = int(i_start * n_raw / n_full)
            e = int(i_end   * n_raw / n_full)
            return _resample(raw[s:e].astype(float), n_lap)

        # Speed: convert m/s → km/h for the "Ground Speed" channel
        for col_name, unit, table in SINGLE_CHANNELS:
            arr = _slice_single(table)
            if arr is None:
                arr = np.full(n_lap, np.nan)
            if col_name == "Speed":
                arr = arr * 3.6  # m/s → km/h
            channels[col_name] = arr

        # Multi-wheel channels
        for prefix, unit, table in MULTI_CHANNELS:
            if table not in existing_tables:
                for suf in WHEEL_SUFFIXES:
                    channels[f"{prefix}_{suf}"] = np.full(n_lap, np.nan)
                continue
            df = con.execute(
                f'SELECT value1, value2, value3, value4 FROM "{table}"'
            ).fetchdf()
            n_raw = len(df)
            s = int(i_start * n_raw / n_full)
            e = int(i_end   * n_raw / n_full)
            for col_db, suf in zip(["value1", "value2", "value3", "value4"], WHEEL_SUFFIXES):
                sliced = df[col_db].values[s:e]
                channels[f"{prefix}_{suf}"] = _resample(sliced.astype(float), n_lap)

        # Event channels (sparse, forward-fill)
        for col_name, unit, table in EVENT_CHANNELS:
            if table not in existing_tables:
                channels[col_name] = np.full(n_lap, np.nan)
                continue
            df = con.execute(f'SELECT ts, value FROM "{table}"').fetchdf()
            ts_ev  = df["ts"].values
            val_ev = df["value"].values
            filled_100 = _ffill(ts_ev, val_ev, gps_lap)
            filled_10  = filled_100[::10][:n_lap]
            if len(filled_10) < n_lap:
                filled_10 = np.pad(filled_10, (0, n_lap - len(filled_10)),
                                   constant_values=np.nan)
            channels[col_name] = filled_10

        # Time axis (seconds from lap start, 10 Hz)
        channels["Time"] = np.linspace(0.0, (n_lap - 1) / 10.0, n_lap)

    finally:
        con.close()

    return 10, channels  # 10 Hz sample rate


def _build_column_metadata() -> tuple[list[str], list[str]]:
    """Return (column_names, column_units) in the same order as _load_lap_channels."""
    names = ["Time"]
    units = ["s"]

    for col_name, unit, _ in SINGLE_CHANNELS:
        names.append(col_name)
        units.append(unit)

    for prefix, unit, _ in MULTI_CHANNELS:
        for suf in WHEEL_SUFFIXES:
            names.append(f"{prefix}_{suf}")
            units.append(unit)

    for col_name, unit, _ in EVENT_CHANNELS:
        names.append(col_name)
        units.append(unit)

    return names, units


def export_lap_to_motec_csv(
    db_path: str | Path,
    ts_start: float,
    ts_end: float,
    lap_number: int,
    venue: str = "",
    vehicle: str = "LMU",
    driver: str = "",
    recorded_at: datetime | None = None,
) -> bytes:
    """
    Export a single lap from a DuckDB session file to MoTeC i2 CSV format.

    Parameters
    ----------
    db_path      : path to the .duckdb file
    ts_start     : lap start timestamp (seconds)
    ts_end       : lap end timestamp (seconds)
    lap_number   : lap index for the comment field
    venue        : circuit / track name
    vehicle      : car / vehicle name
    driver       : driver name
    recorded_at  : session datetime (used for Log Date/Time headers)

    Returns
    -------
    bytes : UTF-8 encoded CSV ready to stream as a download
    """
    sample_rate, channels = _load_lap_channels(db_path, ts_start, ts_end)
    col_names, col_units = _build_column_metadata()

    if recorded_at is None:
        recorded_at = datetime.now(tz=timezone.utc)

    buf = io.StringIO()
    writer = csv.writer(buf)

    # ── MoTeC i2 header rows ──────────────────────────────────────────────
    writer.writerow(["Format",      "MoTeC CSV Export"])
    writer.writerow(["Venue",       venue])
    writer.writerow(["Vehicle",     vehicle])
    writer.writerow(["Driver",      driver])
    writer.writerow(["Device",      "ApexDash"])
    writer.writerow(["Comment",     f"Lap {lap_number} exported from ApexDash"])
    writer.writerow(["Log Date",    recorded_at.strftime("%d/%m/%Y")])
    writer.writerow(["Log Time",    recorded_at.strftime("%H:%M:%S")])
    writer.writerow(["Sample Rate", str(sample_rate)])
    writer.writerow([])  # blank separator

    # ── Channel headers ───────────────────────────────────────────────────
    writer.writerow(col_names)
    writer.writerow(col_units)

    # ── Data rows ─────────────────────────────────────────────────────────
    n_rows = len(channels["Time"])
    for i in range(n_rows):
        row: list[Any] = []
        for col in col_names:
            val = channels.get(col, np.array([np.nan]))[i] if col in channels else np.nan
            if np.isnan(val):
                row.append("")
            else:
                # Round to 4 decimal places to keep file size reasonable
                row.append(round(float(val), 4))
        writer.writerow(row)

    return buf.getvalue().encode("utf-8")
