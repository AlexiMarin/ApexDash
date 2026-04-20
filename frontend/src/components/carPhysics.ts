// ═══════════════════════════════════════════════════════════════════════
// Car Suspension Physics — shared by RearViewCar & SideViewCar
//
// All vehicle-dynamics formulas live here so they can be audited,
// tuned, and unit-tested in one place.
// ═══════════════════════════════════════════════════════════════════════

// ── Shared helpers ───────────────────────────────────────────────────

export const clamp01 = (v: number | null | undefined, fallback = 0.5) =>
  Math.max(0, Math.min(1, v ?? fallback))

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

/** G-force colour: green < threshold1 < yellow < threshold2 < red */
export function gColor(absG: number, t1 = 1, t2 = 2.2): string {
  return absG < t1 ? '#4ade80' : absG < t2 ? '#facc15' : '#f87171'
}

/** Suspension-travel colour: red (compressed) → yellow → green (nominal) */
export function suspColor(v: number): string {
  return v < 0.3 ? '#f87171' : v < 0.58 ? '#facc15' : '#4ade80'
}

/** Coil-spring SVG path between two points */
export function coilPath(
  x1: number, y1: number,
  x2: number, y2: number,
  n = 7, a = 3,
): string {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy)
  if (l < 3) return `M${x1},${y1}L${x2},${y2}`
  const nx = -dy / l, ny = dx / l
  let d = `M${x1.toFixed(1)},${y1.toFixed(1)}`
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), s = i % 2 ? 1 : -1
    d += `L${(x1 + dx * t + nx * a * s).toFixed(1)},${(y1 + dy * t + ny * a * s).toFixed(1)}`
  }
  return d + `L${x2.toFixed(1)},${y2.toFixed(1)}`
}

/** Rotate point (px,py) around centre (cx,cy) by angleDeg */
export function rotatePoint(
  px: number, py: number,
  cx: number, cy: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = angleDeg * Math.PI / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)
  return {
    x: cx + (px - cx) * cos - (py - cy) * sin,
    y: cy + (px - cx) * sin + (py - cy) * cos,
  }
}

// ── Rear-view physics ────────────────────────────────────────────────

export interface RearPhysicsInput {
  gLat: number
  gVert?: number | null
  suspRL?: number | null
  suspRR?: number | null
  rideHeightRL?: number | null
  rideHeightRR?: number | null
  rear3rdDefl?: number | null
}

export interface RearPhysics {
  // Normalised suspension positions [0..1]
  rl: number; rr: number; r3d: number
  // Feature flags
  hasRH: boolean; hasSusp: boolean
  // Ride heights (metres, with nominal fallback)
  rhRL: number; rhRR: number
  // Body dynamics (degrees / px)
  rollDeg: number; heaveOff: number
  // Colours
  gc: string; cL: string; cR: string; cH: string
  // Wheel hub Y and lift detection  (px-space, needs layout constants)
  hLy: number; hRy: number; liftL: boolean; liftR: boolean
  // Body centre Y (px)
  BY: number
  // Camber angles (degrees)
  camL: number; camR: number
  // Readout labels
  rlMm: number; rrMm: number; r3dMm: number
  rollLbl: string; gLbl: string
  // Rotated strut attachment points (px)
  rsLx: number; rsLy: number; rsRx: number; rsRy: number
}

// Layout constants for rear view (px)
const REAR_W  = 220, REAR_GY = 140
const REAR_TH = 30,  REAR_SPX = 8
const REAR_CX = REAR_W / 2
const REAR_HUB_NOM = REAR_GY - REAR_TH / 2   // 125
const RH_NOM = 0.055

export function computeRearPhysics(input: RearPhysicsInput): RearPhysics {
  const { gLat, rear3rdDefl } = input

  // ── Suspension normalisation ────────────────────────────────────────
  const rl  = clamp01(input.suspRL)
  const rr  = clamp01(input.suspRR)
  const r3d = clamp01(rear3rdDefl, (rl + rr) / 2)
  const hasRH   = input.rideHeightRL != null || input.rideHeightRR != null
  const hasSusp = input.suspRL != null || input.suspRR != null

  const rhRL = input.rideHeightRL ?? RH_NOM
  const rhRR = input.rideHeightRR ?? RH_NOM

  // ── Roll ────────────────────────────────────────────────────────────
  // Positive rollDeg → body leans clockwise (top to the right)
  //
  // Priority: ride-height sensors > suspension potentiometers > lateral G
  //
  // Sign convention for gLat fallback:
  //   gLat > 0 = centripetal acceleration to the right (right turn)
  //   In a right turn the body rolls LEFT (exterior) → rollDeg < 0
  //   Therefore rollDeg = -gLat * GAIN
  const TRACK_W = 1.55   // track width (m)
  const AMP = 18          // amplifier for ride-height → visual degrees
  let rollDeg: number
  if (hasRH)
    rollDeg = Math.atan2(rhRL - rhRR, TRACK_W) * (180 / Math.PI) * AMP
  else if (hasSusp)
    rollDeg = Math.atan2((rl - rr) * 0.058, TRACK_W) * (180 / Math.PI) * AMP
  else
    rollDeg = -gLat * 3.3
  rollDeg = clamp(rollDeg, -12, 12)

  // ── Heave ───────────────────────────────────────────────────────────
  const heaveNorm = rear3rdDefl != null ? r3d : (rl + rr) / 2
  const heaveOff  = (heaveNorm - 0.5) * 8

  // ── Colours ─────────────────────────────────────────────────────────
  const gc = gColor(Math.abs(gLat))
  const cL = suspColor(rl), cR = suspColor(rr), cH = suspColor(r3d)

  // ── Wheel hubs (px) ─────────────────────────────────────────────────
  const hLy = Math.min(REAR_HUB_NOM - (rl - 0.5) * REAR_SPX, REAR_GY - REAR_TH / 2)
  const hRy = Math.min(REAR_HUB_NOM - (rr - 0.5) * REAR_SPX, REAR_GY - REAR_TH / 2)

  // ── Lift detection ──────────────────────────────────────────────────
  const liftL = (hasRH && rhRL < 0.008) || rl > 0.93
  const liftR = (hasRH && rhRR < 0.008) || rr > 0.93

  // ── Body Y (px) ─────────────────────────────────────────────────────
  const BY = 76 - heaveOff

  // ── Camber (subtle visual, degrees) ─────────────────────────────────
  const camL =  (0.8 + 0.8 * (0.5 - rl))
  const camR = -(0.8 + 0.8 * (0.5 - rr))

  // ── Readouts ────────────────────────────────────────────────────────
  const rlMm  = Math.round(35 + rl * 58)
  const rrMm  = Math.round(35 + rr * 58)
  const r3dMm = Math.round(47 + r3d * 37)
  const rollLbl = `${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}°`
  const gLbl    = `${gLat >= 0 ? '+' : ''}${gLat.toFixed(2)}g`

  // ── Rotated strut attachment points ─────────────────────────────────
  const sLx = REAR_CX - 50, sRx = REAR_CX + 50, sY = BY + 22
  const rsL = rotatePoint(sLx, sY, REAR_CX, BY, rollDeg)
  const rsR = rotatePoint(sRx, sY, REAR_CX, BY, rollDeg)

  return {
    rl, rr, r3d, hasRH, hasSusp, rhRL, rhRR,
    rollDeg, heaveOff,
    gc, cL, cR, cH,
    hLy, hRy, liftL, liftR,
    BY, camL, camR,
    rlMm, rrMm, r3dMm, rollLbl, gLbl,
    rsLx: rsL.x, rsLy: rsL.y, rsRx: rsR.x, rsRy: rsR.y,
  }
}

// ── Side-view physics ────────────────────────────────────────────────

export interface SidePhysicsInput {
  gLon: number
  gVert?: number | null
  suspF?: number | null
  suspR?: number | null
  rideHeightF?: number | null
  rideHeightR?: number | null
}

export interface SidePhysics {
  sf: number; sr: number
  pitchDeg: number; heaveOff: number
  gc: string; cF: string; cR: string
  hFy: number; hRy: number; liftF: boolean; liftR: boolean
  BY: number
  sfMm: number; srMm: number
  pitchLbl: string; gLbl: string
  // Rotated strut attachments (px)
  rsFx: number; rsFy: number; rsRx: number; rsRy: number
}

// Layout constants for side view (px)
const SIDE_W  = 220, SIDE_GY = 112
const SIDE_TH = 26, SIDE_WB = 120, SIDE_WHEEL_VIS = 3
const SIDE_CX = SIDE_W / 2
const SIDE_HUB_NOM = SIDE_GY - SIDE_TH / 2

export function computeSidePhysics(input: SidePhysicsInput): SidePhysics {
  const { gLon } = input

  // ── Suspension normalisation ────────────────────────────────────────
  const sf = clamp01(input.suspF)
  const sr = clamp01(input.suspR)

  // ── Pitch (from longitudinal G only = weight transfer) ─────────────
  // Braking (gLon < 0) → nose dives → positive pitch angle
  // Acceleration (gLon > 0) → nose lifts → negative pitch angle
  const pitchDeg = clamp(-gLon * 3.2, -6, 6)

  // ── Heave (from vertical G = aero load) ─────────────────────────────
  // Chassis does NOT bounce per bump — suspension absorbs that.
  // Only lowers slightly with more downforce (gVert > 1).
  const gV = input.gVert ?? 1.0
  const heaveOff = clamp((gV - 1.0) * 2.5, -3, 3)

  // ── Colours ─────────────────────────────────────────────────────────
  const gc = gColor(Math.abs(gLon), 0.5, 1.2)
  const cF = suspColor(sf), cR = suspColor(sr)

  // ── Wheel hubs (px) ─────────────────────────────────────────────────
  const hFy = SIDE_HUB_NOM - (sf - 0.5) * SIDE_WHEEL_VIS
  const hRy = SIDE_HUB_NOM - (sr - 0.5) * SIDE_WHEEL_VIS

  // ── Lift detection ──────────────────────────────────────────────────
  const rhF = input.rideHeightF ?? 0.055
  const rhR = input.rideHeightR ?? 0.055
  const liftF = rhF < 0.008 || sf > 0.93
  const liftR = rhR < 0.008 || sr > 0.93

  // ── Body Y (px) ─────────────────────────────────────────────────────
  const BY = 68 - heaveOff

  // ── Readouts ────────────────────────────────────────────────────────
  const sfMm = Math.round(35 + sf * 58)
  const srMm = Math.round(35 + sr * 58)
  const pitchLbl = `${pitchDeg >= 0 ? '+' : ''}${pitchDeg.toFixed(1)}°`
  const gLbl     = `${gLon >= 0 ? '+' : ''}${gLon.toFixed(2)}g`

  // ── Rotated strut attachment points ─────────────────────────────────
  const sFx = SIDE_CX - SIDE_WB / 2 + 8
  const sRx2 = SIDE_CX + SIDE_WB / 2 - 8
  const sSy = BY + 18
  const rsF = rotatePoint(sFx, sSy, SIDE_CX, BY, pitchDeg)
  const rsR = rotatePoint(sRx2, sSy, SIDE_CX, BY, pitchDeg)

  return {
    sf, sr,
    pitchDeg, heaveOff,
    gc, cF, cR,
    hFy, hRy, liftF, liftR,
    BY,
    sfMm, srMm, pitchLbl, gLbl,
    rsFx: rsF.x, rsFy: rsF.y, rsRx: rsR.x, rsRy: rsR.y,
  }
}
