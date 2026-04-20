"""
Backend API para análisis de telemetría de Le Mans Ultimate
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # load .env before anything else reads os.environ

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import run_migrations
from .routers import circuits, export, laps, saved_laps, sessions

CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
    if o.strip()
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_migrations()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="LMU Telemetry API",
    description="API para análisis de telemetría de Le Mans Ultimate",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(circuits.router)
app.include_router(sessions.router)
app.include_router(laps.router)
app.include_router(saved_laps.router)
app.include_router(export.router)


@app.get("/")
async def root():
    return {"message": "LMU Telemetry API", "version": "0.1.0"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}

