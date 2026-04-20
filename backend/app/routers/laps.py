"""
GET /api/sessions/{session_id}/laps           – list all laps
GET /api/sessions/{session_id}/laps/{lap_num} – single lap detail
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Lap, Session

router = APIRouter(prefix="/api/sessions/{session_id}/laps", tags=["laps"])


# ── Schemas ──────────────────────────────────────────────────

class LapOut(BaseModel):
    id: str
    lap_number: int
    lap_time_ms: int | None
    sector1_ms: int | None
    sector2_ms: int | None
    sector3_ms: int | None
    valid: bool
    invalid_reason: str | None = None

    class Config:
        from_attributes = True


# ── Helpers ──────────────────────────────────────────────────

async def _get_session_or_404(session_id: UUID, db: AsyncSession) -> Session:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


# ── Endpoints ─────────────────────────────────────────────────

@router.get("", response_model=list[LapOut])
async def list_laps(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    await _get_session_or_404(session_id, db)
    result = await db.execute(
        select(Lap).where(Lap.session_id == session_id).order_by(Lap.lap_number)
    )
    return result.scalars().all()


@router.get("/{lap_number}", response_model=LapOut)
async def get_lap(
    session_id: UUID,
    lap_number: int,
    db: AsyncSession = Depends(get_db),
):
    await _get_session_or_404(session_id, db)
    result = await db.execute(
        select(Lap).where(Lap.session_id == session_id, Lap.lap_number == lap_number)
    )
    lap = result.scalar_one_or_none()
    if not lap:
        raise HTTPException(status_code=404, detail="Lap not found")
    return lap
