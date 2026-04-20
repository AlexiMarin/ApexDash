"""
Saved Laps - Una vuelta guardada por circuito (single-user mode).

POST   /api/saved-laps                  – guardar una vuelta (reemplaza si existe)
GET    /api/saved-laps                  – listar todas las vueltas guardadas
GET    /api/saved-laps/{track}          – obtener la vuelta guardada para un circuito
DELETE /api/saved-laps/{track}          – eliminar la vuelta guardada
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import ApprovedCircuit, SavedLap

router = APIRouter(prefix="/api/saved-laps", tags=["saved-laps"])

# Max body size for telemetry JSON (10 MB)
_MAX_BODY_BYTES = 10 * 1024 * 1024


# ── Schemas ──────────────────────────────────────────────────

class SaveLapRequest(BaseModel):
    track: str = Field(..., min_length=1, max_length=200)
    lap_time_ms: int | None = Field(None, ge=0, le=600_000)
    sector1_ms: int | None = Field(None, ge=0, le=300_000)
    sector2_ms: int | None = Field(None, ge=0, le=300_000)
    sector3_ms: int | None = Field(None, ge=0, le=300_000)
    telemetry: dict


class SavedLapOut(BaseModel):
    id: str
    track: str
    lap_time_ms: int | None
    sector1_ms: int | None
    sector2_ms: int | None
    sector3_ms: int | None
    saved_at: str

    class Config:
        from_attributes = True


class SavedLapDetail(SavedLapOut):
    """Incluye telemetría completa para comparación."""
    telemetry: dict


# ── Endpoints ─────────────────────────────────────────────────

@router.post("", response_model=SavedLapOut, status_code=status.HTTP_201_CREATED)
async def save_lap(
    body: SaveLapRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Guarda una vuelta como referencia para el circuito.
    Si ya existe una vuelta guardada para ese circuito, la reemplaza.
    Telemetry data is sent directly by the frontend (processed client-side).
    """
    # Enforce body size limit
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Request body too large")

    # Validate track against approved circuits
    approved = await db.execute(
        select(ApprovedCircuit).where(ApprovedCircuit.layout == body.track)
    )
    if approved.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=422,
            detail=f"Circuit '{body.track}' is not in the list of approved circuits.",
        )

    # Validate telemetry structure
    telemetry = body.telemetry
    if "lap_dist" not in telemetry or "channels" not in telemetry:
        raise HTTPException(status_code=422, detail="Invalid telemetry: must contain lap_dist and channels")
    if not isinstance(telemetry["lap_dist"], list) or len(telemetry["lap_dist"]) > 50_000:
        raise HTTPException(status_code=422, detail="Invalid telemetry: lap_dist must be a list with ≤50000 samples")
    channels = telemetry.get("channels", {})
    if not isinstance(channels, dict):
        raise HTTPException(status_code=422, detail="Invalid telemetry: channels must be an object")
    for key, val in channels.items():
        if isinstance(val, list) and len(val) > 50_000:
            raise HTTPException(status_code=422, detail=f"Channel '{key}' exceeds max 50000 samples")

    # Eliminar vuelta guardada existente para este circuito (si existe)
    await db.execute(
        delete(SavedLap).where(SavedLap.track == body.track)
    )

    # Crear nueva entrada
    saved = SavedLap(
        track=body.track,
        lap_time_ms=body.lap_time_ms,
        sector1_ms=body.sector1_ms,
        sector2_ms=body.sector2_ms,
        sector3_ms=body.sector3_ms,
        telemetry=telemetry,
    )
    db.add(saved)
    await db.commit()
    await db.refresh(saved)

    return {
        "id": str(saved.id),
        "track": saved.track,
        "lap_time_ms": saved.lap_time_ms,
        "sector1_ms": saved.sector1_ms,
        "sector2_ms": saved.sector2_ms,
        "sector3_ms": saved.sector3_ms,
        "saved_at": saved.saved_at.isoformat(),
    }


@router.get("", response_model=list[SavedLapOut])
async def list_saved_laps(
    db: AsyncSession = Depends(get_db),
):
    """Lista todas las vueltas guardadas."""
    result = await db.execute(
        select(SavedLap).order_by(SavedLap.track)
    )
    laps = result.scalars().all()
    return [
        {
            "id": str(lap.id),
            "track": lap.track,
            "lap_time_ms": lap.lap_time_ms,
            "sector1_ms": lap.sector1_ms,
            "sector2_ms": lap.sector2_ms,
            "sector3_ms": lap.sector3_ms,
            "saved_at": lap.saved_at.isoformat(),
        }
        for lap in laps
    ]


@router.get("/{track}", response_model=SavedLapDetail)
async def get_saved_lap(
    track: str,
    db: AsyncSession = Depends(get_db),
):
    """Obtiene la vuelta guardada para un circuito específico (con telemetría)."""
    result = await db.execute(
        select(SavedLap).where(SavedLap.track == track)
    )
    saved = result.scalar_one_or_none()
    if not saved:
        raise HTTPException(status_code=404, detail="No saved lap for this track")

    return {
        "id": str(saved.id),
        "track": saved.track,
        "lap_time_ms": saved.lap_time_ms,
        "sector1_ms": saved.sector1_ms,
        "sector2_ms": saved.sector2_ms,
        "sector3_ms": saved.sector3_ms,
        "saved_at": saved.saved_at.isoformat(),
        "telemetry": saved.telemetry,
    }


@router.delete("/{track}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_lap(
    track: str,
    db: AsyncSession = Depends(get_db),
):
    """Elimina la vuelta guardada para un circuito."""
    result = await db.execute(
        delete(SavedLap).where(SavedLap.track == track)
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="No saved lap for this track")
