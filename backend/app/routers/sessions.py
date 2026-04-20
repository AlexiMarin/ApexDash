"""
POST /api/sessions          – save session metadata (JSON, no file upload)
GET  /api/sessions          – list all sessions
GET  /api/sessions/{id}     – session detail
DELETE /api/sessions/{id}   – delete session
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, conlist
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import ApprovedCircuit, Lap, Session

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ── Schemas ──────────────────────────────────────────────────

class LapInput(BaseModel):
    lap_number: int = Field(..., ge=0, le=200)
    lap_time_ms: int | None = Field(None, ge=0, le=3_600_000)
    sector1_ms: int | None = Field(None, ge=0, le=1_800_000)
    sector2_ms: int | None = Field(None, ge=0, le=1_800_000)
    sector3_ms: int | None = Field(None, ge=0, le=1_800_000)
    valid: bool
    ts_start: float
    ts_end: float


class CreateSessionRequest(BaseModel):
    track: str = Field(..., min_length=1, max_length=200)
    session_type: str = Field(..., min_length=1, max_length=10)
    recorded_at: str | None = None
    filename: str = Field(..., min_length=1, max_length=300)
    size_bytes: int | None = Field(None, ge=0)
    laps: conlist(LapInput, min_length=1, max_length=500)  # type: ignore[valid-type]


class LapSummary(BaseModel):
    lap_number: int
    lap_time_ms: int | None
    sector1_ms: int | None
    sector2_ms: int | None
    sector3_ms: int | None
    valid: bool

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    id: str
    track: str
    session_type: str
    recorded_at: str | None
    filename: str
    size_bytes: int | None
    imported_at: str
    lap_count: int
    best_lap_ms: int | None

    class Config:
        from_attributes = True


class SessionDetail(SessionOut):
    laps: list[LapSummary]


# ── Helpers ──────────────────────────────────────────────────

def _session_to_out(session: Session, laps: list) -> dict:
    valid_laps = [l for l in laps if l.valid and l.lap_time_ms]
    return {
        "id": str(session.id),
        "track": session.track,
        "session_type": session.session_type,
        "recorded_at": session.recorded_at.isoformat() if session.recorded_at else None,
        "filename": session.filename,
        "size_bytes": session.size_bytes,
        "imported_at": session.imported_at.isoformat(),
        "lap_count": len(laps),
        "best_lap_ms": min((l.lap_time_ms for l in valid_laps), default=None),
    }


# ── Endpoints ─────────────────────────────────────────────────

@router.post("", response_model=SessionDetail, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Save session metadata extracted by the client from a DuckDB file."""
    # Validate track against approved circuits (match by layout = TrackLayout)
    approved = await db.execute(
        select(ApprovedCircuit).where(ApprovedCircuit.layout == body.track)
    )
    if approved.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=422,
            detail=f"Circuit '{body.track}' is not in the list of approved circuits.",
        )

    recorded_at = None
    if body.recorded_at:
        from datetime import datetime
        try:
            recorded_at = datetime.fromisoformat(body.recorded_at).replace(tzinfo=None)
        except ValueError:
            pass

    session = Session(
        track=body.track,
        session_type=body.session_type,
        recorded_at=recorded_at,
        filename=body.filename,
        size_bytes=body.size_bytes,
    )
    db.add(session)
    await db.flush()

    for lap in body.laps:
        db.add(Lap(
            session_id=session.id,
            lap_number=lap.lap_number,
            lap_time_ms=lap.lap_time_ms,
            sector1_ms=lap.sector1_ms,
            sector2_ms=lap.sector2_ms,
            sector3_ms=lap.sector3_ms,
            valid=lap.valid,
            ts_start=lap.ts_start,
            ts_end=lap.ts_end,
        ))

    await db.commit()
    await db.refresh(session)

    laps_result = await db.execute(
        select(Lap).where(Lap.session_id == session.id).order_by(Lap.lap_number)
    )
    laps = laps_result.scalars().all()

    out = _session_to_out(session, laps)
    out["laps"] = [
        {
            "lap_number": l.lap_number,
            "lap_time_ms": l.lap_time_ms,
            "sector1_ms": l.sector1_ms,
            "sector2_ms": l.sector2_ms,
            "sector3_ms": l.sector3_ms,
            "valid": l.valid,
        }
        for l in laps
    ]
    return out


@router.get("", response_model=list[SessionOut])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Session).order_by(Session.imported_at.desc())
    )
    sessions = result.scalars().all()

    out = []
    for s in sessions:
        laps_result = await db.execute(
            select(Lap).where(Lap.session_id == s.id)
        )
        laps = laps_result.scalars().all()
        out.append(_session_to_out(s, laps))
    return out


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    laps_result = await db.execute(
        select(Lap).where(Lap.session_id == session_id).order_by(Lap.lap_number)
    )
    laps = laps_result.scalars().all()

    out = _session_to_out(session, laps)
    out["laps"] = [
        {
            "lap_number": l.lap_number,
            "lap_time_ms": l.lap_time_ms,
            "sector1_ms": l.sector1_ms,
            "sector2_ms": l.sector2_ms,
            "sector3_ms": l.sector3_ms,
            "valid": l.valid,
        }
        for l in laps
    ]
    return out


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(session)
    await db.commit()
