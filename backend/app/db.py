"""
Conexión asíncrona a PostgreSQL (SQLAlchemy 2 + asyncpg).

Uso típico en endpoints FastAPI:

    @app.get("/example")
    async def example(db: AsyncSession = Depends(get_db)):
        result = await db.execute(select(MyModel))
        ...
"""
import os
import pathlib
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


def _get_engine():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and configure it."
        )
    return create_async_engine(url, pool_size=5, max_overflow=10, echo=False)


engine = _get_engine()

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def run_migrations() -> None:
    """Ejecuta todos los archivos .sql de /migrations en orden al iniciar la app."""
    migrations_dir = pathlib.Path(__file__).parent.parent / "migrations"
    sql_files = sorted(migrations_dir.glob("*.sql"))

    async with engine.begin() as conn:
        for sql_file in sql_files:
            statements = [
                s.strip()
                for s in sql_file.read_text().split(";")
                if s.strip()
                and not all(
                    line.startswith("--")
                    for line in s.strip().splitlines()
                    if line.strip()
                )
            ]
            for stmt in statements:
                await conn.execute(text(stmt))
