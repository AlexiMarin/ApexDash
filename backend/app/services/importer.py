"""
Import service: reads a DuckDB session file, extracts lap metadata
and returns plain dicts ready to be inserted into PostgreSQL.

Deliberately sync (no async) so it can run in a thread pool
via `fastapi.concurrency.run_in_threadpool`.
"""
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Make `analysis` importable as a package from the backend root
_backend_dir = Path(__file__).parent.parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from analysis.laps import extract_laps, load_session  # noqa: E402


# ── Filename parser ──────────────────────────────────────────

_FILENAME_RE = re.compile(
    r"^(?P<track>.+)_(?P<type>P|Q|R|FP\d?)_"
    r"(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}Z)$"
)


def parse_filename(filename: str) -> tuple[str, str, datetime | None]:
    """Extract (track, session_type, recorded_at) from a DuckDB filename."""
    stem = Path(filename).stem
    m = _FILENAME_RE.match(stem)
    if not m:
        return stem, "Unknown", None

    ts_str = m.group("ts").replace("_", ":")  # 2026-03-31T04:07:26Z
    try:
        recorded_at = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        recorded_at = None

    return m.group("track"), m.group("type"), recorded_at


# ── Core importer ────────────────────────────────────────────

def run_import(
    file_path: str | Path,
    filename: str,
    storage_key: str,
    size_bytes: int,
) -> tuple[dict, list[dict]]:
    """
    Load a DuckDB session file and extract all lap metadata.

    Returns:
        session_data  – dict for inserting a Session row
        laps_data     – list of dicts for inserting Lap rows

    Does NOT write to PostgreSQL; the caller handles DB commits.
    """
    file_path = Path(file_path)
    track, session_type, recorded_at = parse_filename(filename)

    data = load_session(str(file_path))

    # Prefer layout-specific name from the file's metadata table
    meta = data.get("metadata", {})
    if meta.get("TrackLayout"):
        track = meta["TrackLayout"]
    elif meta.get("TrackName"):
        track = meta["TrackName"]

    laps_raw = extract_laps(data)

    session_data = {
        "track": track,
        "session_type": session_type,
        "recorded_at": recorded_at,
        "filename": filename,
        "storage_key": storage_key,
        "size_bytes": size_bytes,
    }

    laps_data = []
    for lap in laps_raw:
        st = lap["sector_times"]
        laps_data.append({
            "lap_number": lap["num"],
            "lap_time_ms": round(lap["duration"] * 1000) if lap["valid"] else None,
            "sector1_ms": round(st["s1"] * 1000) if st.get("s1") else None,
            "sector2_ms": round(st["s2"] * 1000) if st.get("s2") else None,
            "sector3_ms": round(st["s3"] * 1000) if st.get("s3") else None,
            "valid": lap["valid"],
            "ts_start": float(lap["ts_start"]),
            "ts_end": float(lap["ts_end"]),
        })

    return session_data, laps_data
