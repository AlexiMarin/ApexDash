<h1 align="center">ApexDash</h1>

<p align="center">
  <strong>Open-source telemetry analysis platform for Le Mans Ultimate</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" alt="Python 3.10+" />
  <img src="https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/DuckDB--WASM-1.33-FFC107?logo=duckdb&logoColor=black" alt="DuckDB WASM" />
  <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 17" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License" />
</p>

---

## What is ApexDash?

ApexDash is a web-based telemetry analysis tool designed for **Le Mans Ultimate** sim racers. Upload your `.duckdb` telemetry files and get detailed lap analysis — track maps, speed traces, throttle/brake inputs, slip angles, suspension data, lap comparisons, and more — all processed **client-side** in your browser for maximum privacy and speed.

> **Privacy first:** Your telemetry files never leave your browser. All `.duckdb` processing happens locally via DuckDB-WASM.

---

## Features

- **Interactive Track Map** — GPS-based track visualization with color-coded speed, throttle, brakes, and delta overlays
- **Telemetry Charts** — Throttle, brake, TC, ABS, gear, speed traces synced to track position
- **Lap Comparison** — Compare laps side by side with ghost delta visualization
- **Car Physics View** — Real-time slip angle, suspension travel, and lateral G visualization
- **MoTeC Export** — Export telemetry data to MoTeC `.ld` format for use in MoTeC i2
- **Circuit Library** — Browse circuits with track cards and metadata
- **Client-side DuckDB** — All telemetry processing runs in the browser via DuckDB-WASM
- **Docker Ready** — One-command deployment with Docker Compose

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript 5, Tailwind CSS 3, Recharts, Vite 5 |
| **Telemetry Engine** | DuckDB-WASM (client-side, in-browser processing) |
| **Backend** | FastAPI, SQLAlchemy (async), Uvicorn |
| **Database** | PostgreSQL 17 |
| **Deployment** | Docker, Docker Compose, Nginx |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **PostgreSQL** 17 (or use Docker)
- **Docker & Docker Compose** (for containerized setup)

### Local Development

**1. Clone the repository**

```bash
git clone https://github.com/aleximarin/apexdash.git
cd apexdash
```

**2. Backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/lmutry
CORS_ORIGINS=http://localhost:5173
```

Start the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Deployment

### Quick Start (no repo clone needed)

```bash
mkdir apexdash && cd apexdash
curl -fsSL https://raw.githubusercontent.com/AlexiMarin/ApexDash/main/docker-compose.prod.yaml -o docker-compose.yaml
curl -fsSL https://raw.githubusercontent.com/AlexiMarin/ApexDash/main/.env.example -o .env
```

Edit `.env` and set a secure `POSTGRES_PASSWORD`, then:

```bash
docker compose up -d
```

Open `http://localhost` and start analyzing your telemetry.

### Docker Compose (from cloned repo)

```bash
cp .env.example .env
# edit .env → set POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yaml up -d
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | *(required)* | PostgreSQL password |
| `POSTGRES_USER` | `postgres` | PostgreSQL user |
| `POSTGRES_DB` | `lmutry` | Database name |
| `CORS_ORIGINS` | `http://localhost` | Allowed CORS origins |
| `APEXDASH_VERSION` | `latest` | Image tag to pull |

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                  │     │                  │     │                  │
│   Nginx + React  │────▶│   FastAPI        │────▶│   PostgreSQL     │
│   (Frontend)     │     │   (Backend)      │     │   (Database)     │
│                  │     │                  │     │                  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │
        │  .duckdb files processed
        │  entirely in-browser
        ▼
┌─────────────────┐
│  DuckDB-WASM    │
│  (Client-side)  │
└─────────────────┘
```

---

## Project Structure

```
apexdash/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entrypoint
│   │   ├── db.py                # Database connection & migrations
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── routers/             # API route handlers
│   │   └── services/            # Business logic & exports
│   ├── analysis/                # Telemetry analysis utilities
│   ├── migrations/              # SQL migration files
│   └── pyproject.toml
├── frontend/
│   └── src/
│       ├── components/          # React components (charts, maps, car views)
│       ├── contexts/            # Language context
│       ├── lib/                 # DuckDB, API client, telemetry reader
│       ├── pages/               # Route pages
│       └── types/               # TypeScript type definitions
└── docker-compose.prod.yaml     # Production Docker setup
```

---

### Development Guidelines

- Frontend: Follow the existing TypeScript + React patterns
- Backend: Use `ruff` for linting (`ruff check .`)
- Keep telemetry processing client-side when possible
- Write descriptive commit messages

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made for the sim racing community
</p>
