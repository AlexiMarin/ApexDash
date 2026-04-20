import uuid as _uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Double, ForeignKey, SmallInteger, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from .db import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[_uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    track: Mapped[str] = mapped_column(Text, nullable=False)
    session_type: Mapped[str] = mapped_column(Text, nullable=False)
    recorded_at: Mapped[datetime | None]
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    imported_at: Mapped[datetime] = mapped_column(server_default=func.now())

    laps: Mapped[list["Lap"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="Lap.lap_number",
    )


class Lap(Base):
    __tablename__ = "laps"

    id: Mapped[_uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    session_id: Mapped[_uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    lap_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    lap_time_ms: Mapped[int | None]
    sector1_ms: Mapped[int | None]
    sector2_ms: Mapped[int | None]
    sector3_ms: Mapped[int | None]
    valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ts_start: Mapped[float | None] = mapped_column(Double)
    ts_end: Mapped[float | None] = mapped_column(Double)

    session: Mapped["Session"] = relationship(back_populates="laps")


class SavedLap(Base):
    """Una vuelta guardada por circuito (single-user mode)."""
    __tablename__ = "saved_laps"

    id: Mapped[_uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    track: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    lap_time_ms: Mapped[int | None]
    sector1_ms: Mapped[int | None]
    sector2_ms: Mapped[int | None]
    sector3_ms: Mapped[int | None]
    telemetry: Mapped[dict] = mapped_column(JSONB, nullable=False)
    saved_at: Mapped[datetime] = mapped_column(server_default=func.now())


class ApprovedCircuit(Base):
    __tablename__ = "approved_circuits"
    __table_args__ = (UniqueConstraint("name", "layout", name="approved_circuits_name_layout_key"),)

    id: Mapped[_uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    layout: Mapped[str] = mapped_column(Text, nullable=False)
    short_name: Mapped[str | None] = mapped_column(Text)
    flag: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
