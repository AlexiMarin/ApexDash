"""
Telemetry endpoints — organized by analysis group.

All routes share the same base prefix:
  /api/sessions/{session_id}/laps/{lap_number}

Available groups
  /layout      – GPS trace + speed       (draw the circuit map)
  /inputs      – throttle, brake, steering, gear, clutch
  /engine      – RPM, oil temp, water temp, turbo boost
  /speeds      – speed, G-forces, per-wheel speed
  /tyres       – rubber temps, pressure, wear, slip angle  (FL/FR/RL/RR)
  /brakes      – brake temps, brake force, ABS            (FL/FR/RL/RR)
  /suspension  – travel, velocity, ride height, heave deflection
  /fuel        – fuel level, consumption
  /channels    – raw multi-channel (generic, ?ch=...)

Every response has the shape:
  {
    "session_id": int,
    "lap_number": int,
    "valid": bool,
    "lap_time_ms": int | null,
    "lap_dist": [float, ...],      # ← always present, X axis (meters)
    "channels": { ... }            # group-specific channels
  }

Single-value channels   → "speed_kmh": [float, ...]
Per-wheel channels      → "brake_temp": {"FL": [...], "FR": [...], "RL": [...], "RR": [...]}
"""
import os
import sys
from pathlib import Path
from typing import Annotated

from uuid import UUID

import numpy as np
from scipy.ndimage import median_filter as _median_filter
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from ..telemetry_utils import compute_slip_angle as _compute_slip_angle
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..duck import load_lap_data
from ..models import Lap, Session

router = APIRouter(
    prefix="/api/sessions/{session_id}/laps/{lap_number}",
    tags=["telemetry"],
)

_STORAGE_PATH = Path(os.environ.get("FILE_STORAGE_PATH", "./uploads"))

# Make analysis package importable (needed only for the generic /channels route)
_backend_dir = Path(__file__).parent.parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))


# ── Shared dependency ────────────────────────────────────────

async def _resolve_lap(
    session_id: UUID,
    lap_number: int,
    db: AsyncSession = Depends(get_db),
) -> tuple[Session, Lap]:
    sess = (await db.execute(select(Session).where(Session.id == session_id))).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    lap = (
        await db.execute(
            select(Lap).where(Lap.session_id == session_id, Lap.lap_number == lap_number)
        )
    ).scalar_one_or_none()
    if not lap:
        raise HTTPException(status_code=404, detail="Lap not found")
    if lap.ts_start is None or lap.ts_end is None:
        raise HTTPException(status_code=422, detail="Lap has no timestamp boundaries")
    file_path = _STORAGE_PATH / sess.storage_key
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Session file not found on disk")
    return sess, lap


def _base_meta(session_id: UUID, lap: Lap) -> dict:
    return {
        "session_id": str(session_id),
        "lap_number": lap.lap_number,
        "valid": lap.valid,
        "lap_time_ms": lap.lap_time_ms,
    }


def _arr(a: np.ndarray) -> list:
    return [None if np.isnan(v) else round(float(v), 5) for v in a]


def _wheels(d: dict[str, np.ndarray]) -> dict[str, list[float]]:
    return {k: _arr(v) for k, v in d.items()}


def _strip_lap_dist_wrap(data: dict) -> dict:
    """Strip samples before the lap_dist reset.

    The DuckDB slice may include the tail of the previous lap where
    lap_dist is near its max (e.g. 6975m) before it resets to 0.
    Detect the big drop and trim everything before it.
    """
    ld = data.get("lap_dist")
    if ld is None or len(ld) < 2:
        return data
    diffs = np.diff(ld)
    resets = np.where(diffs < -100)[0]
    if len(resets) == 0:
        return data
    start = int(resets[0]) + 1
    return {k: (v[start:] if isinstance(v, np.ndarray) else v)
            for k, v in data.items()}


# ── /layout ──────────────────────────────────────────────────
# GPS trace + speed — everything needed to draw the circuit map
# and color it by any channel.

@router.get("/layout")
async def get_layout(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single={
            "lat":          "GPS Latitude",
            "lon":          "GPS Longitude",
            "lap_dist":     "Lap Dist",
            "speed_ms":     "Ground Speed",
            "throttle":     "Throttle Pos",
            "brake":        "Brake Pos",
            "g_lat":        "G Force Lat",
            "g_lon":        "G Force Long",
            "path_lateral": "Path Lateral",
            "track_edge":   "Track Edge",
            "rear_3rd_defl":"Rear3rdDeflection",
            "g_vert":       "G Force Vert",
        },
        multi={
            "wheel_speed":  "Wheel Speed",
            "susp_pos":     "Susp Pos",
            "ride_heights": "RideHeights",
        },
        events={
            "current_sector": "Current Sector",
            "tc":             "TC",
            "tc_level":       "TCLevel",
        },
    )
    data = _strip_lap_dist_wrap(data)

    # Compute body slip angle from GPS + lateral G
    slip_angle_deg = _compute_slip_angle(
        data["lat"], data["lon"], data["speed_ms"], data["g_lat"]
    )

    # Compute per-wheel slip ratio: (wheel_speed - ground_speed) / ground_speed
    # Positive = wheel spinning faster (traction loss), negative = locking (braking)
    ws = data["wheel_speed"]  # dict with FL/FR/RL/RR
    n = len(data["speed_ms"])
    v_ground = np.maximum(data["speed_ms"], 0.5)  # avoid div-by-zero
    slip_ratio = {}
    for key in ("FL", "FR", "RL", "RR"):
        w = ws[key]
        # Align lengths (multi vs single resample can differ by 1)
        if len(w) != n:
            w = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(w)), w)
        sr = (w - v_ground) / v_ground
        # Clip to ±1 and apply mild 3-sample median filter to kill spikes
        sr = np.clip(sr, -1.0, 1.0)
        sr = _median_filter(sr, size=3)
        slip_ratio[key] = sr

    # Sector boundary distances — only exact +1 increments, skip first/last 5%
    sector_dists: list[float] = []
    sec = data["current_sector"]
    ld  = data["lap_dist"]

    # Susp Pos per corner: range 0.035–0.093 m (0=compressed, 1=extended)
    sp = data.get("susp_pos", {})
    _sp_min, _sp_max = 0.035, 0.093
    def _sp_norm(arr: np.ndarray) -> list:
        return np.nan_to_num(
            np.clip((arr.astype(float) - _sp_min) / (_sp_max - _sp_min), 0.0, 1.0), nan=0.5
        ).tolist()
    # RideHeights per corner: raw metres (can go negative on wheel lift)
    # Send raw (in metres) — frontend handles visualisation scaling
    rh = data.get("ride_heights", {})
    def _rh_list(arr: np.ndarray) -> list:
        return np.nan_to_num(arr.astype(float), nan=0.05).tolist()

    # Rear 3rd spring: Rear3rdDeflection range 0.047–0.084 m
    rear_3rd = data.get("rear_3rd_defl", np.array([]))
    _r3d_min, _r3d_max = 0.047, 0.084
    rear_3rd_norm: list | None = np.nan_to_num(
        np.clip((rear_3rd.astype(float) - _r3d_min) / (_r3d_max - _r3d_min), 0.0, 1.0), nan=0.5
    ).tolist() if len(rear_3rd) else None

    # TC: forward-filled boolean → 0/1 (NaN before first event → 0)
    tc_arr = np.nan_to_num(data["tc"].astype(float), nan=0.0)
    # TCLevel: forward-fill per-sample so badge updates dynamically mid-lap
    import pandas as _pd
    tc_level_arr = data.get("tc_level", np.array([]))
    tc_level_float = tc_level_arr.astype(float)
    tc_level_filled = _pd.Series(tc_level_float).ffill().bfill().fillna(0).astype(int).tolist()
    valid_tc_level = tc_level_arr[~np.isnan(tc_level_float)]
    tc_level_val: int | None = int(valid_tc_level[0]) if len(valid_tc_level) > 0 else None
    total_dist = float(ld[-1]) if len(ld) > 0 else 0
    min_d = total_dist * 0.02   # skip artefacts at the very start
    for i in range(1, len(sec)):
        prev, curr = sec[i - 1], sec[i]
        if np.isnan(prev) or np.isnan(curr):
            continue
        ip, ic = int(prev), int(curr)
        # Detect sector boundary: sequential +1 OR wrap-around (e.g. 2→0)
        if ic == ip + 1 or (ip > 0 and ic == 0):
            dist = float(ld[min(i, len(ld) - 1)])
            if dist > min_d:
                sector_dists.append(dist)
    return {
        **_base_meta(session_id, lap),
        "sector_dists": sector_dists,
        "tc_level": tc_level_val,
        "lap_dist": _arr(data["lap_dist"]),
        "channels": {
            "lat":          _arr(data["lat"]),
            "lon":          _arr(data["lon"]),
            "speed_kmh":    _arr(data["speed_ms"] * 3.6),
            "throttle":     _arr(data["throttle"]),
            "brake":        _arr(data["brake"]),
            "g_lat":        _arr(data["g_lat"]),
            "g_lon":        _arr(data["g_lon"]),
            "path_lateral": _arr(data["path_lateral"]),
            "track_edge":   _arr(data["track_edge"]),
            "slip_angle_deg": _arr(slip_angle_deg),
            "slip_ratio_fl": _arr(slip_ratio["FL"]),
            "slip_ratio_fr": _arr(slip_ratio["FR"]),
            "slip_ratio_rl": _arr(slip_ratio["RL"]),
            "slip_ratio_rr": _arr(slip_ratio["RR"]),
            "tc":              tc_arr.astype(int).tolist(),
            "tc_level":        tc_level_filled,
            "susp_pos_fl":     _sp_norm(sp["FL"]) if "FL" in sp else None,
            "susp_pos_fr":     _sp_norm(sp["FR"]) if "FR" in sp else None,
            "susp_pos_rl":     _sp_norm(sp["RL"]) if "RL" in sp else None,
            "susp_pos_rr":     _sp_norm(sp["RR"]) if "RR" in sp else None,
            "ride_height_rl":  _rh_list(rh["RL"]) if "RL" in rh else None,
            "ride_height_rr":  _rh_list(rh["RR"]) if "RR" in rh else None,
            "ride_height_fl":  _rh_list(rh["FL"]) if "FL" in rh else None,
            "ride_height_fr":  _rh_list(rh["FR"]) if "FR" in rh else None,
            "rear_3rd_defl":   rear_3rd_norm,
            "g_vert":          _arr(data.get("g_vert", np.array([]))),
        },
    }


# ── /inputs ───────────────────────────────────────────────────
# Driver inputs: throttle, brake, steering, gear, clutch

@router.get("/inputs")
async def get_inputs(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single={
            "lap_dist":  "Lap Dist",
            "throttle":  "Throttle Pos",
            "brake":     "Brake Pos",
            "steering":  "Steering Pos",
            "clutch":    "Clutch Pos",
        },
        events={
            "gear": "Gear",
        },
    )
    data = _strip_lap_dist_wrap(data)
    return {
        **_base_meta(session_id, lap),
        "lap_dist": _arr(data["lap_dist"]),
        "channels": {
            "throttle": _arr(data["throttle"]),
            "brake":    _arr(data["brake"]),
            "steering": _arr(data["steering"]),
            "clutch":   _arr(data["clutch"]),
            "gear":     [int(v) if not np.isnan(v) else None for v in data["gear"]],
        },
    }


# ── /engine ───────────────────────────────────────────────────
# Engine & transmission: RPM, temps, turbo

@router.get("/engine")
async def get_engine(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single={
            "lap_dist":   "Lap Dist",
            "rpm":        "Engine RPM",
            "oil_temp":   "Engine Oil Temp",
            "water_temp": "Engine Water Temp",
            "turbo":      "Turbo Boost Pressure",
        },
        events={
            "gear": "Gear",
        },
    )
    data = _strip_lap_dist_wrap(data)
    return {
        **_base_meta(session_id, lap),
        "lap_dist": _arr(data["lap_dist"]),
        "channels": {
            "rpm":        _arr(data["rpm"]),
            "gear":       [int(v) if not np.isnan(v) else None for v in data["gear"]],
            "oil_temp":   _arr(data["oil_temp"]),
            "water_temp": _arr(data["water_temp"]),
            "turbo_pa":   _arr(data["turbo"]),
        },
    }


# ── /speeds ───────────────────────────────────────────────────
# Speed, G-forces, per-wheel speeds (detect wheel lock / spin)

@router.get("/speeds")
async def get_speeds(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single={
            "lap_dist":  "Lap Dist",
            "speed_ms":  "Ground Speed",
            "g_lat":     "G Force Lat",
            "g_lon":     "G Force Long",
        },
        multi={
            "wheel_speed": "Wheel Speed",
        },
    )
    data = _strip_lap_dist_wrap(data)
    return {
        **_base_meta(session_id, lap),
        "lap_dist": _arr(data["lap_dist"]),
        "channels": {
            "speed_kmh":   _arr(data["speed_ms"] * 3.6),
            "g_lat":       _arr(data["g_lat"]),
            "g_lon":       _arr(data["g_lon"]),
            "wheel_speed": _wheels(data["wheel_speed"]),  # m/s per wheel
        },
    }


# ── /tyres ────────────────────────────────────────────────────
# Tyre temperatures, pressures, wear, slip angle per wheel

@router.get("/tyres")
async def get_tyres(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single={
            "lap_dist": "Lap Dist",
        },
        multi={
            "rubber_temp":  "TyresRubberTemp",
            "carcass_temp": "TyresCarcassTemp",
            "rim_temp":     "TyresRimTemp",
            "temp_centre":  "TyresTempCentre",
            "temp_left":    "TyresTempLeft",
            "temp_right":   "TyresTempRight",
            "pressure":     "TyresPressure",
            "wear":         "Tyres Wear",
        },
        events={
            "slip_angle": "TCSlipAngle",
        },
    )
    data = _strip_lap_dist_wrap(data)
    return {
        **_base_meta(session_id, lap),
        "lap_dist": _arr(data["lap_dist"]),
        "channels": {
            "rubber_temp":  _wheels(data["rubber_temp"]),   # °C goma
            "carcass_temp": _wheels(data["carcass_temp"]),  # °C carcasa
            "rim_temp":     _wheels(data["rim_temp"]),      # °C llanta
            "temp_centre":  _wheels(data["temp_centre"]),   # °C sup. centro
            "temp_left":    _wheels(data["temp_left"]),     # °C sup. izq
            "temp_right":   _wheels(data["temp_right"]),    # °C sup. der
            "pressure":     _wheels(data["pressure"]),      # kPa
            "wear":         _wheels(data["wear"]),          # % (100=new)
            "slip_angle":   _arr(data["slip_angle"]),       # rad (TC)
        },
    }


# ── /brakes ───────────────────────────────────────────────────
# Brake temperatures, forces, ABS events per wheel

@router.get("/brakes")
async def get_brakes(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single={
            "lap_dist": "Lap Dist",
            "brake":    "Brake Pos",
        },
        multi={
            "brake_temp":  "Brakes Temp",
            "brake_force": "Brakes Force",
        },
        events={
            "abs": "ABS",
        },
    )
    data = _strip_lap_dist_wrap(data)
    return {
        **_base_meta(session_id, lap),
        "lap_dist": _arr(data["lap_dist"]),
        "channels": {
            "brake":       _arr(data["brake"]),            # pedal %
            "brake_temp":  _wheels(data["brake_temp"]),    # °C
            "brake_force": _wheels(data["brake_force"]),   # N
            "abs":         [int(v) if not np.isnan(v) else 0 for v in data["abs"]],
        },
    }


# ── /suspension ───────────────────────────────────────────────
# Suspension travel, velocity, ride heights, heave deflection

@router.get("/suspension")
async def get_suspension(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single={
            "lap_dist":            "Lap Dist",
            "speed_ms":            "Ground Speed",
            "ride_height_front":   "FrontRideHeight",
            "ride_height_rear":    "RearRideHeight",
            "heave_front":         "Front3rdDeflection",
            "heave_rear":          "Rear3rdDeflection",
        },
        multi={
            "susp_pos": "Susp Pos",
        },
        events={
            "drs": "FrontFlapActivated",
        },
    )
    data = _strip_lap_dist_wrap(data)
    return {
        **_base_meta(session_id, lap),
        "lap_dist": _arr(data["lap_dist"]),
        "channels": {
            "speed_kmh":           _arr(data["speed_ms"] * 3.6),
            "ride_height_front_m": _arr(data["ride_height_front"]),
            "ride_height_rear_m":  _arr(data["ride_height_rear"]),
            "heave_front_m":       _arr(data["heave_front"]),
            "heave_rear_m":        _arr(data["heave_rear"]),
            "susp_pos_m":          _wheels(data["susp_pos"]),
            "drs":                 [int(v) if not np.isnan(v) else 0 for v in data["drs"]],
        },
    }


# ── /fuel ─────────────────────────────────────────────────────
# Fuel level and consumption

@router.get("/fuel")
async def get_fuel(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single={
            "lap_dist":   "Lap Dist",
            "fuel_level": "Fuel Level",
        },
    )
    data = _strip_lap_dist_wrap(data)
    return {
        **_base_meta(session_id, lap),
        "lap_dist": _arr(data["lap_dist"]),
        "channels": {
            "fuel_level_l": _arr(data["fuel_level"]),
        },
    }


# ── /channels (generic) ───────────────────────────────────────
# Pick any single-value channels by name.
# ?ch=speed_kmh,throttle,brake,rpm,gear,g_lat,g_lon,lat,lon,lap_dist

_SINGLE_CHANNEL_MAP: dict[str, str] = {
    "lat":       "GPS Latitude",
    "lon":       "GPS Longitude",
    "lap_dist":  "Lap Dist",
    "speed_ms":  "Ground Speed",
    "throttle":  "Throttle Pos",
    "brake":     "Brake Pos",
    "steering":  "Steering Pos",
    "clutch":    "Clutch Pos",
    "rpm":       "Engine RPM",
    "g_lat":     "G Force Lat",
    "g_lon":     "G Force Long",
    "path_lateral": "Path Lateral",
    "fuel_level":   "Fuel Level",
    "oil_temp":     "Engine Oil Temp",
    "water_temp":   "Engine Water Temp",
    "turbo":        "Turbo Boost Pressure",
    "ride_height_front": "FrontRideHeight",
    "ride_height_rear":  "RearRideHeight",
}
_EVENT_CHANNEL_MAP: dict[str, str] = {
    "gear": "Gear",
    "abs":  "ABS",
    "drs":  "FrontFlapActivated",
}
_ALL_GENERIC = sorted(_SINGLE_CHANNEL_MAP) + sorted(_EVENT_CHANNEL_MAP)

_DEFAULT_CH = "lap_dist,speed_kmh,throttle,brake,gear,rpm,g_lat,g_lon,lat,lon"


@router.get("/channels")
async def get_channels(
    session_id: UUID,
    lap_number: int,
    dep=Depends(_resolve_lap),
    ch: Annotated[str, Query(description=f"Comma-separated. Available: {', '.join(_ALL_GENERIC)}, speed_kmh")] = _DEFAULT_CH,
    db: AsyncSession = Depends(get_db),
):
    sess, lap = dep
    requested = [c.strip() for c in ch.split(",") if c.strip()]

    want_single: dict[str, str] = {}
    want_events: dict[str, str] = {}
    want_speed_kmh = False

    for name in requested:
        if name == "speed_kmh":
            want_speed_kmh = True
            want_single["speed_ms"] = "Ground Speed"
        elif name in _SINGLE_CHANNEL_MAP:
            want_single[name] = _SINGLE_CHANNEL_MAP[name]
        elif name in _EVENT_CHANNEL_MAP:
            want_events[name] = _EVENT_CHANNEL_MAP[name]
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown channel '{name}'. Available: {_ALL_GENERIC + ['speed_kmh']}",
            )

    data = await run_in_threadpool(
        load_lap_data,
        _STORAGE_PATH / sess.storage_key,
        lap.ts_start,
        lap.ts_end,
        single=want_single or None,
        events=want_events or None,
    )

    channels: dict = {}
    for name in requested:
        if name == "speed_kmh":
            channels["speed_kmh"] = _arr(data["speed_ms"] * 3.6)
        elif name in _EVENT_CHANNEL_MAP:
            channels[name] = [int(v) if not np.isnan(v) else None for v in data[name]]
        else:
            channels[name] = _arr(data[name])

    return {
        **_base_meta(session_id, lap),
        "channels": channels,
    }

