"""
POST /api/sessions/{session_id}/laps/{lap_number}/export/motec
  → streams a MoTeC i2-compatible CSV file for the given lap.

The .duckdb file must be provided as a multipart upload (field: "file"),
since the backend does not store session files server-side.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import tempfile, os

from ..db import get_db
from ..models import Lap, Session
from ..services.motec_export import export_lap_to_motec_csv

router = APIRouter(
    prefix="/api/sessions/{session_id}/laps/{lap_number}/export",
    tags=["export"],
)


@router.post("/motec")
async def export_motec(
    session_id: UUID,
    lap_number: int,
    file: UploadFile = File(..., description=".duckdb session file"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Export a single lap to MoTeC i2 CSV format.

    The client must upload the .duckdb file in the request body (multipart).
    Returns a CSV file download.
    """
    # Verify session exists
    result = await db.execute(
        select(Session).where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Fetch lap timestamps
    lap_result = await db.execute(
        select(Lap).where(Lap.session_id == session_id, Lap.lap_number == lap_number)
    )
    lap = lap_result.scalar_one_or_none()
    if not lap:
        raise HTTPException(status_code=404, detail="Lap not found")

    if lap.ts_start is None or lap.ts_end is None:
        raise HTTPException(status_code=422, detail="Lap has no timestamp data")

    # Write uploaded file to a temp file (sync-safe for duckdb)
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")

    # Parse recorded_at
    recorded_at: datetime | None = None
    if session.recorded_at:
        try:
            recorded_at = session.recorded_at.replace(tzinfo=timezone.utc)
        except Exception:
            recorded_at = None

    with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        csv_bytes = await run_in_threadpool(
            export_lap_to_motec_csv,
            tmp_path,
            float(lap.ts_start),
            float(lap.ts_end),
            lap_number,
            venue=session.track,
            vehicle="LMU",
            driver="",
            recorded_at=recorded_at,
        )
    finally:
        os.unlink(tmp_path)

    filename = f"lap_{lap_number}_{session.track.replace(' ', '_')}.csv"

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(csv_bytes)),
        },
    )
