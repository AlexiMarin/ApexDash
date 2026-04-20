"""
Shared telemetry helpers used by multiple routers.
"""
import numpy as np


def compute_slip_angle(
    lat: np.ndarray,
    lon: np.ndarray,
    speed_ms: np.ndarray,
    g_lat: np.ndarray,
    dt: float = 0.1,
) -> np.ndarray:
    """
    Estimate body slip angle β (degrees) at each sample.

    Method: integrate the lateral velocity equation in body frame:
        dVy/dt = g_lat * 9.81 - r * Vx
    where r = d(COG)/dt is the yaw rate derived from GPS course-over-ground.
    A leaky integrator (τ ≈ 0.4 s) prevents long-term drift.

    Sign: positive β = nose points to outside of corner (FWD understeer tendency).
    """
    n = len(lat)
    if n < 3:
        return np.zeros(n)

    R = 6371000.0
    lat_r = np.radians(lat)
    dlat = np.diff(lat) * np.pi / 180.0 * R
    dlon = np.diff(lon) * np.pi / 180.0 * R * np.cos(lat_r[:-1])

    cog = np.arctan2(dlon, dlat)
    cog = np.unwrap(cog)

    r_raw = np.diff(cog) / dt
    r = np.concatenate([[r_raw[0]], r_raw, [r_raw[-1]]])

    kernel = np.ones(5) / 5
    r = np.convolve(r, kernel, mode='same')

    alpha = float(np.exp(-dt / 0.4))
    g = 9.81
    Vy = 0.0
    beta = np.empty(n)
    for i in range(n):
        v  = max(float(speed_ms[i]), 1.0)
        gl = float(g_lat[i]) * g
        Vy = alpha * Vy + (gl - float(r[i]) * v) * dt
        abs_gl = abs(float(g_lat[i]))
        if abs_gl < 0.05:
            Vy *= 0.3
        elif abs_gl < 0.12:
            Vy *= 0.6
        beta[i] = float(np.degrees(np.arctan2(Vy, v)))

    return beta
