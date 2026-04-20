-- ============================================================
--  001_initial.sql
--  Core schema for LMU Telemetry — UUID primary keys
--  Single-user self-hosted (no auth)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    track        TEXT        NOT NULL,
    session_type TEXT        NOT NULL,
    recorded_at  TIMESTAMPTZ,
    filename     TEXT        NOT NULL,
    size_bytes   BIGINT,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Laps ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS laps (
    id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID             NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    lap_number   SMALLINT         NOT NULL,
    lap_time_ms  INTEGER,
    sector1_ms   INTEGER,
    sector2_ms   INTEGER,
    sector3_ms   INTEGER,
    valid        BOOLEAN          NOT NULL DEFAULT true,
    ts_start     DOUBLE PRECISION,
    ts_end       DOUBLE PRECISION,
    UNIQUE (session_id, lap_number)
);

CREATE INDEX IF NOT EXISTS idx_laps_session ON laps(session_id);

-- ── Saved Laps ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_laps (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    track       TEXT        NOT NULL UNIQUE,
    lap_time_ms INT,
    sector1_ms  INT,
    sector2_ms  INT,
    sector3_ms  INT,
    telemetry   JSONB       NOT NULL,
    saved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_laps_track ON saved_laps(track);

-- ── Approved Circuits ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approved_circuits (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    layout     TEXT        NOT NULL,
    short_name TEXT,
    flag       TEXT,
    country    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, layout)
);
