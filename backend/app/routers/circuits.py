"""
GET /api/circuits           – lista de circuitos aprobados con la vuelta rápida guardada
GET /api/circuits/{name}/layout – lat/lon del trazado (de la vuelta guardada)
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import ApprovedCircuit, SavedLap

router = APIRouter(prefix="/api/circuits", tags=["circuits"])


class CircuitOut(BaseModel):
    name: str
    layout: str
    short_name: str | None
    flag: str | None
    country: str | None
    best_lap_ms: int | None
    sector1_ms: int | None
    sector2_ms: int | None
    sector3_ms: int | None


class CircuitLayoutOut(BaseModel):
    lat: list[float]
    lon: list[float]


@router.get("", response_model=list[CircuitOut])
async def list_circuits(
    db: AsyncSession = Depends(get_db),
):
    circuits_result = await db.execute(
        select(ApprovedCircuit).order_by(ApprovedCircuit.name)
    )
    circuits = circuits_result.scalars().all()

    saved_result = await db.execute(select(SavedLap))
    saved_by_track: dict[str, SavedLap] = {
        s.track: s for s in saved_result.scalars().all()
    }

    return [
        CircuitOut(
            name=c.name,
            layout=c.layout,
            short_name=c.short_name,
            flag=c.flag,
            country=c.country,
            best_lap_ms=saved_by_track[c.layout].lap_time_ms if c.layout in saved_by_track else None,
            sector1_ms=saved_by_track[c.layout].sector1_ms if c.layout in saved_by_track else None,
            sector2_ms=saved_by_track[c.layout].sector2_ms if c.layout in saved_by_track else None,
            sector3_ms=saved_by_track[c.layout].sector3_ms if c.layout in saved_by_track else None,
        )
        for c in circuits
    ]


@router.get("/{name}/layout", response_model=CircuitLayoutOut)
async def get_circuit_layout(
    name: str,
    db: AsyncSession = Depends(get_db),
):
    """Devuelve el trazado lat/lon a partir de la vuelta guardada."""
    result = await db.execute(
        select(SavedLap).where(SavedLap.track == name)
    )
    saved = result.scalar_one_or_none()
    if saved is None:
        raise HTTPException(status_code=404, detail="No saved lap for this circuit")

    telemetry = saved.telemetry or {}
    channels = telemetry.get("channels", {})
    lat = channels.get("lat") or []
    lon = channels.get("lon") or []

    # Downsample to ~200 points for a lightweight response
    step = max(1, len(lat) // 200)
    return CircuitLayoutOut(lat=lat[::step], lon=lon[::step])
