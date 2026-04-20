/**
 * Client-side telemetry reader — port of backend duck.py + analysis/laps.py.
 *
 * Opens a .duckdb session file via duckdb-wasm, extracts lap boundaries,
 * validates laps, and loads all telemetry channels needed for the map view
 * and analysis panels.
 */
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'
import type { LayoutData, LapInfo } from '../types/telemetry'

// ── Helpers ──────────────────────────────────────────────────

/** Linear interpolation of `arr` to `targetLen` points. */
function resample(arr: Float64Array | number[], targetLen: number): number[] {
  const src = arr instanceof Float64Array ? Array.from(arr) : arr
  if (src.length === 0) return new Array(targetLen).fill(NaN)
  if (src.length === targetLen) return src
  const out: number[] = new Array(targetLen)
  for (let i = 0; i < targetLen; i++) {
    const t = (i / (targetLen - 1)) * (src.length - 1)
    const lo = Math.floor(t)
    const hi = Math.min(lo + 1, src.length - 1)
    const frac = t - lo
    out[i] = src[lo] * (1 - frac) + src[hi] * frac
  }
  return out
}

/** Forward-fill sparse events onto a time grid. */
function ffillEvents(
  tsCol: number[],
  valCol: number[],
  gpsTime: number[],
): number[] {
  const out = new Array<number>(gpsTime.length).fill(NaN)
  let j = 0
  for (let i = 0; i < gpsTime.length; i++) {
    while (j < tsCol.length - 1 && tsCol[j + 1] <= gpsTime[i]) j++
    if (tsCol[j] <= gpsTime[i]) out[i] = valCol[j]
  }
  return out
}

/** Round to 5 decimals, NaN → null. */
function arr(a: number[]): (number | null)[] {
  return a.map((v) => (Number.isNaN(v) ? null : Math.round(v * 1e5) / 1e5))
}

/** 3-sample median filter. */
function medianFilter3(a: number[]): number[] {
  if (a.length < 3) return [...a]
  const out = new Array(a.length)
  out[0] = a[0]
  out[a.length - 1] = a[a.length - 1]
  for (let i = 1; i < a.length - 1; i++) {
    const vals = [a[i - 1], a[i], a[i + 1]].sort((x, y) => x - y)
    out[i] = vals[1]
  }
  return out
}

const WHEEL_KEYS = ['FL', 'FR', 'RL', 'RR'] as const
type WheelKey = (typeof WHEEL_KEYS)[number]

// ── Query helpers ───────────────────────────────────────────

async function queryColumn(
  conn: AsyncDuckDBConnection,
  table: string,
): Promise<number[]> {
  const result = await conn.query(`SELECT value FROM "${table}"`)
  const col = result.getChildAt(0)!
  const out: number[] = new Array(col.length)
  for (let i = 0; i < col.length; i++) out[i] = col.get(i) as number
  return out
}

async function queryMultiColumn(
  conn: AsyncDuckDBConnection,
  table: string,
): Promise<Record<WheelKey, number[]>> {
  const result = await conn.query(
    `SELECT value1, value2, value3, value4 FROM "${table}"`,
  )
  const wheels: Record<string, number[]> = {}
  for (let c = 0; c < 4; c++) {
    const col = result.getChildAt(c)!
    const data: number[] = new Array(col.length)
    for (let i = 0; i < col.length; i++) data[i] = col.get(i) as number
    wheels[WHEEL_KEYS[c]] = data
  }
  return wheels as Record<WheelKey, number[]>
}

async function queryEventTable(
  conn: AsyncDuckDBConnection,
  table: string,
): Promise<{ ts: number[]; value: number[] }> {
  const result = await conn.query(`SELECT ts, value FROM "${table}"`)
  const tsCol = result.getChildAt(0)!
  const valCol = result.getChildAt(1)!
  const ts: number[] = new Array(tsCol.length)
  const value: number[] = new Array(valCol.length)
  for (let i = 0; i < tsCol.length; i++) {
    ts[i] = tsCol.get(i) as number
    value[i] = valCol.get(i) as number
  }
  return { ts, value }
}

async function queryMetadata(
  conn: AsyncDuckDBConnection,
): Promise<Record<string, string>> {
  const result = await conn.query('SELECT key, value FROM metadata')
  const keys = result.getChildAt(0)!
  const vals = result.getChildAt(1)!
  const meta: Record<string, string> = {}
  for (let i = 0; i < keys.length; i++) {
    meta[keys.get(i) as string] = vals.get(i) as string
  }
  return meta
}

async function tableExists(
  conn: AsyncDuckDBConnection,
  table: string,
): Promise<boolean> {
  const r = await conn.query(
    `SELECT count(*) as c FROM information_schema.tables WHERE table_name = '${table}'`,
  )
  return (r.getChildAt(0)!.get(0) as number) > 0
}

// ── Slip angle computation (port of telemetry_utils.py) ─────

function computeSlipAngle(
  lat: number[],
  lon: number[],
  speedMs: number[],
  gLat: number[],
  dt = 0.1,
): number[] {
  const n = lat.length
  if (n < 3) return new Array(n).fill(0)

  const R = 6371000
  const deg2rad = Math.PI / 180

  // Course-over-ground from GPS deltas
  const cog: number[] = new Array(n - 1)
  for (let i = 0; i < n - 1; i++) {
    const dlatM = (lat[i + 1] - lat[i]) * deg2rad * R
    const dlonM =
      (lon[i + 1] - lon[i]) * deg2rad * R * Math.cos(lat[i] * deg2rad)
    cog[i] = Math.atan2(dlonM, dlatM)
  }

  // Unwrap COG
  for (let i = 1; i < cog.length; i++) {
    let d = cog[i] - cog[i - 1]
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    cog[i] = cog[i - 1] + d
  }

  // Yaw rate (padded)
  const rRaw: number[] = new Array(n)
  for (let i = 0; i < cog.length - 1; i++) {
    rRaw[i + 1] = (cog[i + 1] - cog[i]) / dt
  }
  rRaw[0] = rRaw[1] ?? 0
  rRaw[n - 1] = rRaw[n - 2] ?? 0

  // 5-sample moving average
  const r: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    let cnt = 0
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) {
      sum += rRaw[k]
      cnt++
    }
    r[i] = sum / cnt
  }

  const alpha = Math.exp(-dt / 0.4)
  const g = 9.81
  let Vy = 0
  const beta: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const v = Math.max(speedMs[i], 1.0)
    const gl = gLat[i] * g
    Vy = alpha * Vy + (gl - r[i] * v) * dt
    const absGl = Math.abs(gLat[i])
    if (absGl < 0.05) Vy *= 0.3
    else if (absGl < 0.12) Vy *= 0.6
    beta[i] = (Math.atan2(Vy, v) * 180) / Math.PI
  }
  return beta
}

// ── Sector time calculation ─────────────────────────────────

interface SectorTimes {
  s1: number | null
  s2: number | null
  s3: number | null
}

function calcSectorTimes(
  tsLapStart: number,
  tsLapEnd: number,
  sectorEvents: { ts: number[]; value: number[] },
): SectorTimes {
  const { ts, value } = sectorEvents
  // Filter to this lap's time range
  const inRange: { ts: number; value: number }[] = []
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] >= tsLapStart && ts[i] <= tsLapEnd) {
      inRange.push({ ts: ts[i], value: value[i] })
    }
  }
  inRange.sort((a, b) => a.ts - b.ts)

  let tsS1End: number | null = null
  let tsS2End: number | null = null
  let tsS3End: number | null = null
  let prevVal: number | null = null

  for (const ev of inRange) {
    const v = ev.value
    if (prevVal === 1 && v === 2) tsS1End = ev.ts
    else if (prevVal === 2 && v === 0) tsS2End = ev.ts
    else if (prevVal === 0 && v === 1) tsS3End = ev.ts
    prevVal = v
  }

  if (tsS3End === null && tsS2End !== null) tsS3End = tsLapEnd

  return {
    s1: tsS1End !== null ? tsS1End - tsLapStart : null,
    s2: tsS1End !== null && tsS2End !== null ? tsS2End - tsS1End : null,
    s3: tsS2End !== null && tsS3End !== null ? tsS3End - tsS2End : null,
  }
}

// ── Main: extract laps (port of analysis/laps.py) ───────────

export interface ExtractedLap {
  num: number
  tsStart: number
  tsEnd: number
  duration: number
  valid: boolean
  reason: string | null
  sectorTimes: SectorTimes
  lapTimeMsValid: number | null
  sector1Ms: number | null
  sector2Ms: number | null
  sector3Ms: number | null
}

export interface SessionData {
  metadata: Record<string, string>
  laps: ExtractedLap[]
  lapInfos: LapInfo[]
  track: string
  sessionType: string
  recordedAt: string | null
}

/**
 * Parse filename: "Track Name_P_2026-03-28T06_15_43Z.duckdb"
 */
function parseFilename(
  filename: string,
): { track: string; sessionType: string; recordedAt: string | null } {
  const stem = filename.replace(/\.duckdb$/i, '')
  const re =
    /^(?<track>.+)_(?<type>P|Q|R|FP\d?)_(?<ts>\d{4}-\d{2}-\d{2}T\d{2}_\d{2}_\d{2}Z)$/
  const m = re.exec(stem)
  if (!m?.groups) return { track: stem, sessionType: 'Unknown', recordedAt: null }

  const tsStr = m.groups.ts.replace(/_/g, ':')
  return {
    track: m.groups.track,
    sessionType: m.groups.type,
    recordedAt: tsStr.replace('Z', '+00:00'),
  }
}

/**
 * Load session metadata and extract lap boundaries.
 * This is the first step — reads the minimal data needed to show the lap list.
 */
export async function extractSession(
  conn: AsyncDuckDBConnection,
  filename: string,
): Promise<SessionData> {
  const metadata = await queryMetadata(conn)
  const { track: fileTrack, sessionType, recordedAt } = parseFilename(filename)
  const track = metadata.TrackLayout || metadata.TrackName || fileTrack

  // GPS Time (100 Hz reference)
  const gpsTime = await queryColumn(conn, 'GPS Time')

  // Lap events
  const lapEvents = await queryEventTable(conn, 'Lap')

  // Sector events
  const sectorEvents = await queryEventTable(conn, 'Current Sector')

  // Pit events
  const inPitsData = await queryEventTable(conn, 'In Pits')
  const pitTimestamps = inPitsData.ts.filter(
    (_, i) => inPitsData.value[i] === 1,
  )

  const tsEndSession = gpsTime[gpsTime.length - 1]

  // Build lap boundaries
  const laps: ExtractedLap[] = []
  for (let i = 0; i < lapEvents.ts.length; i++) {
    const tsStart = lapEvents.ts[i]
    const tsEnd =
      i + 1 < lapEvents.ts.length ? lapEvents.ts[i + 1] : tsEndSession
    const lapNum = lapEvents.value[i]
    const duration = tsEnd - tsStart
    const isLast = tsEnd >= tsEndSession - 0.1

    let valid = true
    let reason: string | null = null

    if (isLast) {
      valid = false
      reason = 'incomplete'
    }

    const pitDuring = pitTimestamps.some((t) => t >= tsStart && t <= tsEnd)
    if (pitDuring) {
      valid = false
      reason = 'pit_lap'
    }

    if (duration < 60) {
      valid = false
      reason = 'too_short'
    }

    const sectorTimes = calcSectorTimes(tsStart, tsEnd, sectorEvents)

    laps.push({
      num: lapNum,
      tsStart,
      tsEnd,
      duration,
      valid,
      reason,
      sectorTimes,
      lapTimeMsValid: valid ? Math.round(duration * 1000) : null,
      sector1Ms: sectorTimes.s1 !== null ? Math.round(sectorTimes.s1 * 1000) : null,
      sector2Ms: sectorTimes.s2 !== null ? Math.round(sectorTimes.s2 * 1000) : null,
      sector3Ms: sectorTimes.s3 !== null ? Math.round(sectorTimes.s3 * 1000) : null,
    })
  }

  const lapInfos: LapInfo[] = laps.map((l) => ({
    lap_number: l.num,
    lap_time_ms: l.lapTimeMsValid,
    valid: l.valid,
  }))

  return { metadata, laps, lapInfos, track, sessionType, recordedAt }
}

// ── Load full layout telemetry for one lap ──────────────────

/**
 * Load all telemetry channels for a single lap.
 * This is the equivalent of the /layout endpoint — everything needed
 * for the track map and all analysis panels.
 */
export async function loadLapLayout(
  conn: AsyncDuckDBConnection,
  tsStart: number,
  tsEnd: number,
): Promise<LayoutData> {
  // ── Reference grid: GPS Time (100 Hz)
  const gpsTimeFull = await queryColumn(conn, 'GPS Time')
  const nGpsFull = gpsTimeFull.length

  // Lap slice indices (in 100 Hz space)
  let i100Start = 0
  let minDiff = Infinity
  for (let i = 0; i < nGpsFull; i++) {
    const d = Math.abs(gpsTimeFull[i] - tsStart)
    if (d < minDiff) {
      minDiff = d
      i100Start = i
    }
  }
  let i100End = 0
  minDiff = Infinity
  for (let i = 0; i < nGpsFull; i++) {
    const d = Math.abs(gpsTimeFull[i] - tsEnd)
    if (d < minDiff) {
      minDiff = d
      i100End = i
    }
  }

  const gpsTimeLap = gpsTimeFull.slice(i100Start, i100End)
  const i10Start = Math.floor(i100Start / 10)
  const i10End = Math.floor(i100End / 10)
  const nLap = Math.max(i10End - i10Start, 1)

  // ── Helper: load & slice a single channel
  async function loadSingle(table: string): Promise<number[]> {
    const raw = await queryColumn(conn, table)
    const nRaw = raw.length
    const chStart = Math.floor((i100Start * nRaw) / nGpsFull)
    const chEnd = Math.floor((i100End * nRaw) / nGpsFull)
    const sliced = raw.slice(chStart, chEnd)
    return sliced.length === nLap ? sliced : resample(sliced, nLap)
  }

  // ── Helper: load & slice multi (4-wheel) channel
  async function loadMulti(
    table: string,
  ): Promise<Record<WheelKey, number[]>> {
    const raw = await queryMultiColumn(conn, table)
    const nRaw = raw.FL.length
    const chStart = Math.floor((i100Start * nRaw) / nGpsFull)
    const chEnd = Math.floor((i100End * nRaw) / nGpsFull)
    const result: Record<string, number[]> = {}
    for (const key of WHEEL_KEYS) {
      const sliced = raw[key].slice(chStart, chEnd)
      result[key] = resample(sliced, nLap)
    }
    return result as Record<WheelKey, number[]>
  }

  // ── Helper: load & forward-fill event channel
  async function loadEvent(table: string): Promise<number[]> {
    const ev = await queryEventTable(conn, table)
    const filled100 = ffillEvents(ev.ts, ev.value, gpsTimeLap)
    // Downsample to 10 Hz
    const filled: number[] = []
    for (let i = 0; i < filled100.length; i += 10) {
      filled.push(filled100[i])
    }
    return filled.slice(0, nLap)
  }

  // ── Conditionally load a table (skip if not present)
  async function loadSingleSafe(table: string): Promise<number[] | null> {
    if (!(await tableExists(conn, table))) return null
    return loadSingle(table)
  }
  async function loadMultiSafe(
    table: string,
  ): Promise<Record<WheelKey, number[]> | null> {
    if (!(await tableExists(conn, table))) return null
    return loadMulti(table)
  }
  async function loadEventSafe(table: string): Promise<number[] | null> {
    if (!(await tableExists(conn, table))) return null
    return loadEvent(table)
  }

  // ── Load all channels in parallel
  const [
    lat,
    lon,
    lapDist,
    speedMs,
    throttle,
    brake,
    gLat,
    gLon,
    pathLateral,
    trackEdge,
    rear3rd,
    gVert,
    steering,
    wheelSpeed,
    suspPos,
    rideHeights,
    currentSector,
    tc,
    tcLevel,
    gear,
    abs,
    absLevel,
  ] = await Promise.all([
    loadSingle('GPS Latitude'),
    loadSingle('GPS Longitude'),
    loadSingle('Lap Dist'),
    loadSingle('Ground Speed'),
    loadSingle('Throttle Pos'),
    loadSingle('Brake Pos'),
    loadSingle('G Force Lat'),
    loadSingle('G Force Long'),
    loadSingle('Path Lateral'),
    loadSingleSafe('Track Edge'),
    loadSingleSafe('Rear3rdDeflection'),
    loadSingleSafe('G Force Vert'),
    loadSingle('Steering Pos'),
    loadMultiSafe('Wheel Speed'),
    loadMultiSafe('Susp Pos'),
    loadMultiSafe('RideHeights'),
    loadEvent('Current Sector'),
    loadEventSafe('TC'),
    loadEventSafe('TCLevel'),
    loadEvent('Gear'),
    loadEventSafe('ABS'),
    loadEventSafe('ABSLevel'),
  ])

  // ── Strip lap_dist wrap (samples before reset)
  let startIdx = 0
  for (let i = 1; i < lapDist.length; i++) {
    if (lapDist[i] - lapDist[i - 1] < -100) {
      startIdx = i
      break
    }
  }

  function sliceFrom<T>(a: T[] | null, idx: number): T[] | null {
    if (!a || idx === 0) return a
    return a.slice(idx)
  }
  function sliceWheels(
    w: Record<WheelKey, number[]> | null,
    idx: number,
  ): Record<WheelKey, number[]> | null {
    if (!w || idx === 0) return w
    const out: Record<string, number[]> = {}
    for (const k of WHEEL_KEYS) out[k] = w[k].slice(idx)
    return out as Record<WheelKey, number[]>
  }

  const sLat = sliceFrom(lat, startIdx)!
  const sLon = sliceFrom(lon, startIdx)!
  const sLapDist = sliceFrom(lapDist, startIdx)!
  const sSpeedMs = sliceFrom(speedMs, startIdx)!
  const sThrottle = sliceFrom(throttle, startIdx)!
  const sBrake = sliceFrom(brake, startIdx)!
  const sGLat = sliceFrom(gLat, startIdx)!
  const sGLon = sliceFrom(gLon, startIdx)!
  const sPathLateral = sliceFrom(pathLateral, startIdx)!
  const sTrackEdge = sliceFrom(trackEdge, startIdx)
  const sRear3rd = sliceFrom(rear3rd, startIdx)
  const sGVert = sliceFrom(gVert, startIdx)
  const sSteering = sliceFrom(steering, startIdx)!
  const sWheelSpeed = sliceWheels(wheelSpeed, startIdx)
  const sSuspPos = sliceWheels(suspPos, startIdx)
  const sRideHeights = sliceWheels(rideHeights, startIdx)
  const sSector = sliceFrom(currentSector, startIdx)!
  const sTc = sliceFrom(tc, startIdx)
  const sTcLevel = sliceFrom(tcLevel, startIdx)
  const sGear = sliceFrom(gear, startIdx)!
  const sAbs = sliceFrom(abs, startIdx)
  const sAbsLevel = sliceFrom(absLevel, startIdx)

  // ── Compute slip angle
  const slipAngleDeg = computeSlipAngle(sLat, sLon, sSpeedMs, sGLat)

  // ── Compute slip ratio per wheel
  const n = sSpeedMs.length
  const vGround = sSpeedMs.map((v) => Math.max(v, 0.5))
  const slipRatio: Record<WheelKey, number[]> = { FL: [], FR: [], RL: [], RR: [] }
  if (sWheelSpeed) {
    for (const key of WHEEL_KEYS) {
      let w = sWheelSpeed[key]
      if (w.length !== n) w = resample(w, n)
      const sr = w.map((wi, i) =>
        Math.max(-1, Math.min(1, (wi - vGround[i]) / vGround[i])),
      )
      slipRatio[key] = medianFilter3(sr)
    }
  }

  // ── Suspension normalisation (0.035–0.093 m range)
  const spMin = 0.035
  const spMax = 0.093
  function spNorm(a: number[]): number[] {
    return a.map((v) => {
      if (Number.isNaN(v)) return 0.5
      return Math.max(0, Math.min(1, (v - spMin) / (spMax - spMin)))
    })
  }

  // ── Ride heights (raw metres, NaN → 0.05)
  function rhList(a: number[]): number[] {
    return a.map((v) => (Number.isNaN(v) ? 0.05 : v))
  }

  // ── Rear 3rd spring (normalised 0.047–0.084)
  const r3dMin = 0.047
  const r3dMax = 0.084
  const rear3rdNorm =
    sRear3rd && sRear3rd.length > 0
      ? sRear3rd.map((v) => {
          if (Number.isNaN(v)) return 0.5
          return Math.max(0, Math.min(1, (v - r3dMin) / (r3dMax - r3dMin)))
        })
      : null

  // ── TC (forward-filled, NaN → 0)
  const tcArr = sTc ? sTc.map((v) => (Number.isNaN(v) ? 0 : Math.round(v))) : null
  const tcLevelFilled = sTcLevel
    ? (() => {
        // Forward-fill then backward-fill
        const a = [...sTcLevel]
        for (let i = 1; i < a.length; i++) {
          if (Number.isNaN(a[i])) a[i] = a[i - 1]
        }
        for (let i = a.length - 2; i >= 0; i--) {
          if (Number.isNaN(a[i])) a[i] = a[i + 1]
        }
        return a.map((v) => (Number.isNaN(v) ? 0 : Math.round(v)))
      })()
    : null

  // TC level badge value (first non-NaN)
  let tcLevelVal: number | null = null
  if (sTcLevel) {
    const first = sTcLevel.find((v) => !Number.isNaN(v))
    if (first !== undefined) tcLevelVal = Math.round(first)
  }

  // ── ABS (forward-filled, NaN → 0)
  const absArr = sAbs ? sAbs.map((v) => (Number.isNaN(v) ? 0 : Math.round(v))) : null
  const absLevelFilled = sAbsLevel
    ? (() => {
        const a = [...sAbsLevel]
        for (let i = 1; i < a.length; i++) {
          if (Number.isNaN(a[i])) a[i] = a[i - 1]
        }
        for (let i = a.length - 2; i >= 0; i--) {
          if (Number.isNaN(a[i])) a[i] = a[i + 1]
        }
        return a.map((v) => (Number.isNaN(v) ? 0 : Math.round(v)))
      })()
    : null

  // ── Sector boundary distances
  const sectorDists: number[] = []
  const totalDist = sLapDist.length > 0 ? sLapDist[sLapDist.length - 1] : 0
  const minD = totalDist * 0.02
  for (let i = 1; i < sSector.length; i++) {
    const prev = sSector[i - 1]
    const curr = sSector[i]
    if (Number.isNaN(prev) || Number.isNaN(curr)) continue
    const ip = Math.round(prev)
    const ic = Math.round(curr)
    if (ic === ip + 1 || (ip > 0 && ic === 0)) {
      const dist = sLapDist[Math.min(i, sLapDist.length - 1)]
      if (dist > minD) sectorDists.push(dist)
    }
  }

  return {
    lap_dist: arr(sLapDist) as number[],
    lap_time_ms: null, // caller fills from ExtractedLap
    valid: true,
    sector_dists: sectorDists,
    tc_level: tcLevelVal,
    channels: {
      lat: arr(sLat) as number[],
      lon: arr(sLon) as number[],
      speed_kmh: arr(sSpeedMs) as number[],
      throttle: arr(sThrottle) as number[],
      brake: arr(sBrake) as number[],
      g_lat: arr(sGLat) as number[],
      g_lon: arr(sGLon) as number[],
      path_lateral: arr(sPathLateral) as number[],
      track_edge: arr(sTrackEdge ?? sPathLateral) as number[],
      slip_angle_deg: arr(slipAngleDeg) as number[],
      slip_ratio_fl: arr(slipRatio.FL) as number[],
      slip_ratio_fr: arr(slipRatio.FR) as number[],
      slip_ratio_rl: arr(slipRatio.RL) as number[],
      slip_ratio_rr: arr(slipRatio.RR) as number[],
      tc: tcArr ?? undefined,
      tc_level: tcLevelFilled ?? undefined,
      abs: absArr ?? undefined,
      abs_level: absLevelFilled ?? undefined,
      susp_pos_fl: sSuspPos ? spNorm(sSuspPos.FL) : undefined,
      susp_pos_fr: sSuspPos ? spNorm(sSuspPos.FR) : undefined,
      susp_pos_rl: sSuspPos ? spNorm(sSuspPos.RL) : undefined,
      susp_pos_rr: sSuspPos ? spNorm(sSuspPos.RR) : undefined,
      ride_height_fl: sRideHeights ? rhList(sRideHeights.FL) : undefined,
      ride_height_fr: sRideHeights ? rhList(sRideHeights.FR) : undefined,
      ride_height_rl: sRideHeights ? rhList(sRideHeights.RL) : undefined,
      ride_height_rr: sRideHeights ? rhList(sRideHeights.RR) : undefined,
      rear_3rd_defl: rear3rdNorm ?? undefined,
      g_vert: arr(sGVert ?? []) as number[],
      // Extra channels for saved laps / panels
      steering: arr(sSteering) as number[],
      gear: sGear.map((v) =>
        Number.isNaN(v) ? null : Math.round(v),
      ) as number[],
    },
  }
}

// ── Build telemetry for saving ──────────────────────────────

/**
 * Build the telemetry JSON payload that gets sent to the backend
 * when the user saves a lap. Same shape as the old _load_lap_telemetry.
 */
export function buildSaveTelemetry(layout: LayoutData): {
  lap_dist: (number | null)[]
  channels: Record<string, unknown>
} {
  return {
    lap_dist: layout.lap_dist,
    channels: layout.channels,
  }
}
