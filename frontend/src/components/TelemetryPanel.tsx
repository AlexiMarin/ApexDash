import { useEffect, useState } from 'react'
import api from '../lib/api'
import { useT } from '../contexts/LanguageContext'

// ── Types ────────────────────────────────────────────────────

interface LayoutData {
  lap_dist: number[]
  channels: { throttle: number[]; brake: number[] }
}

interface InputsData {
  lap_dist: number[]
  channels: { throttle: number[]; brake: number[]; steering: number[]; gear: (number | null)[] }
}

interface EngineData {
  lap_dist: number[]
  channels: { rpm: number[]; gear: (number | null)[]; oil_temp: number[]; water_temp: number[] }
}

interface SpeedsData {
  lap_dist: number[]
  channels: { speed_kmh: number[]; g_lat: number[]; g_lon: number[] }
}

interface TyresData {
  lap_dist: number[]
  channels: {
    rubber_temp:  WheelChannels
    carcass_temp: WheelChannels
    rim_temp:     WheelChannels
    temp_centre:  WheelChannels
    temp_left:    WheelChannels
    temp_right:   WheelChannels
    pressure:     WheelChannels
    wear:         WheelChannels
    slip_angle:   (number | null)[]
  }
}

interface BrakesData {
  lap_dist: number[]
  channels: { brake_temp: WheelChannels }
}

type WheelChannels = { FL: number[]; FR: number[]; RL: number[]; RR: number[] }

export interface GhostTelemetry {
  lap_dist: (number | null)[]
  lap_time_ms: number | null
  channels: {
    speed_kmh: (number | null)[]
    throttle:  (number | null)[]
    brake:     (number | null)[]
    steering:  (number | null)[]
    gear:      (number | null)[]
    g_lat:     (number | null)[]
    g_lon:     (number | null)[]
    tc?:            (number | null)[]
    abs?:           (number | null)[]
    abs_level?:     (number | null)[]
    slip_angle_deg?: (number | null)[]
    susp_pos_fl?:   (number | null)[]
    susp_pos_fr?:   (number | null)[]
    susp_pos_rl?:   (number | null)[]
    susp_pos_rr?:   (number | null)[]
    ride_height_fl?: (number | null)[]
    ride_height_fr?: (number | null)[]
    ride_height_rl?: (number | null)[]
    ride_height_rr?: (number | null)[]
    rear_3rd_defl?:  (number | null)[]
    g_vert?:         (number | null)[]
  }
}

interface Props {
  sessionId: string
  lapNumber: number
  lapTimeMs: number | null
  layoutData: LayoutData
  ghostTelemetry?: GhostTelemetry | null
  progress?: number
}

// ── Resample: map ghost channels onto a target lap_dist axis ───

function resample(
  ghostDist: (number | null)[],
  ghostVals: (number | null)[],
  targetDist: number[],
): number[] {
  // Build clean numeric pairs, keeping only monotonically increasing dist
  const pts: [number, number][] = []
  let lastD = -Infinity
  for (let i = 0; i < ghostDist.length; i++) {
    const d = ghostDist[i], v = ghostVals[i]
    if (d != null && v != null && Number.isFinite(d) && Number.isFinite(v) && d > lastD) {
      pts.push([d, v])
      lastD = d
    }
  }
  if (pts.length < 2) return targetDist.map(() => 0)

  // Also clean targetDist: skip leading non-monotonic samples
  let tStart = 0
  for (let i = 1; i < targetDist.length; i++) {
    if (targetDist[i] < targetDist[i - 1] - 100) {
      tStart = i
      break
    }
  }

  // Resample by normalized lap fraction (0-1)
  const ghostMin = pts[0][0]
  const ghostRange = (pts[pts.length - 1][0] - ghostMin) || 1
  const targetMin = targetDist[tStart] ?? 0
  const targetRange = (targetDist[targetDist.length - 1] - targetMin) || 1

  return targetDist.map(td => {
    const f = (td - targetMin) / targetRange  // 0-1 position in target lap
    // Binary search for bracket
    let lo = 0, hi = pts.length - 1
    // Map fraction to ghost distance
    const gd = ghostMin + f * ghostRange
    if (gd <= pts[0][0]) return pts[0][1]
    if (gd >= pts[hi][0]) return pts[hi][1]
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (pts[mid][0] <= gd) lo = mid; else hi = mid
    }
    const span = pts[hi][0] - pts[lo][0] || 1
    const t = (gd - pts[lo][0]) / span
    return pts[lo][1] + t * (pts[hi][1] - pts[lo][1])
  })
}

// ── Mini SVG chart ───────────────────────────────────────────

const CP = { top: 8, right: 8, bottom: 20, left: 44 }

const CHART_ZOOM = 5 // zoom factor when following progress

function MiniChart({
  title,
  lapDist,
  series,
  height = 90,
  yLabel = '',
  progress,
}: {
  title: string
  lapDist: number[]
  series: { values: number[]; color: string; label?: string; fill?: boolean }[]
  height?: number
  yLabel?: string
  progress?: number
}) {
  const width = 860
  const n = lapDist.length
  if (n < 2) return null

  const plotW = width  - CP.left - CP.right
  const plotH = height - CP.top  - CP.bottom
  const maxDist = lapDist[n - 1] || 1

  const allVals = series.flatMap(s => s.values.filter(Number.isFinite))
  const minVal  = Math.min(...allVals)
  const maxVal  = Math.max(...allVals) || 1

  function px(d: number) { return CP.left + (d / maxDist) * plotW }
  function py(v: number) { return CP.top  + plotH - ((v - minVal) / (maxVal - minVal)) * plotH }

  // Y ticks (3-4)
  const yRange = maxVal - minVal || 1
  const raw   = yRange / 3
  const mag   = Math.pow(10, Math.floor(Math.log10(raw)))
  const nice  = [1, 2, 5, 10].map(f => f * mag).find(f => f >= raw) ?? mag
  const yTicks: number[] = []
  for (let v = Math.ceil(minVal / nice) * nice; v <= maxVal + 1e-9; v += nice) yTicks.push(v)

  // X ticks
  const xInterval = maxDist > 5000 ? 2000 : 1000
  const xTicks: number[] = []
  for (let d = 0; d <= maxDist; d += xInterval) xTicks.push(d)

  // Zoom viewBox when progress is active
  const zooming = progress != null && progress > 0 && progress < 1
  let vbX = 0, vbW = width
  if (zooming) {
    const centerX = px(progress * maxDist)
    vbW = width / CHART_ZOOM
    vbX = centerX - vbW / 2
    // clamp
    if (vbX < 0) vbX = 0
    if (vbX + vbW > width) vbX = width - vbW
  }

  return (
    <div>
      <p className="text-xs text-gray-400 font-semibold mb-1">{title}</p>
      <svg
        viewBox={`${vbX.toFixed(1)} 0 ${vbW.toFixed(1)} ${height}`}
        width="100%"
        style={{ display: 'block', transition: zooming ? 'none' : 'all 0.3s ease-out' }}
      >
        {/* Grid */}
        {yTicks.map(v => (
          <line key={v} x1={CP.left} y1={py(v)} x2={CP.left + plotW} y2={py(v)}
            stroke="#fff" strokeOpacity={0.05} strokeWidth={1} />
        ))}

        {series.map((s, si) => {
          const pts = Array.from({ length: Math.min(n, s.values.length) }, (_, i) =>
            `${px(lapDist[i]).toFixed(1)},${py(s.values[i]).toFixed(1)}`
          ).join(' ')
          const nn = Math.min(n, s.values.length)
          return (
            <g key={si}>
              {s.fill && (
                <path
                  d={`M ${px(lapDist[0]).toFixed(1)},${py(0).toFixed(1)} ` +
                    Array.from({ length: nn }, (_, i) =>
                      `L ${px(lapDist[i]).toFixed(1)},${py(s.values[i]).toFixed(1)}`
                    ).join(' ') +
                    ` L ${px(lapDist[nn - 1]).toFixed(1)},${py(0).toFixed(1)} Z`}
                  fill={s.color} fillOpacity={0.25}
                />
              )}
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={1.3} opacity={0.9} />
            </g>
          )
        })}

        {/* Progress cursor line */}
        {zooming && (
          <line
            x1={px(progress * maxDist)} y1={CP.top}
            x2={px(progress * maxDist)} y2={CP.top + plotH}
            stroke="#fff" strokeWidth={1.5} strokeOpacity={0.7}
          />
        )}

        {/* Y labels */}
        {yTicks.map(v => (
          <text key={v} x={CP.left - 4} y={py(v) + 4}
            fill="#6b7280" fontSize={9} textAnchor="end" fontFamily="monospace">
            {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(v < 10 ? 1 : 0)}
          </text>
        ))}

        {/* Y axis title */}
        {yLabel && (
          <text x={10} y={CP.top + plotH / 2} fill="#6b7280" fontSize={9} textAnchor="middle"
            transform={`rotate(-90, 10, ${CP.top + plotH / 2})`} fontFamily="sans-serif">
            {yLabel}
          </text>
        )}

        {/* X labels (bottom chart only — always show for last series) */}
        {xTicks.map(d => (
          <text key={d} x={px(d)} y={height - 4}
            fill="#6b7280" fontSize={9} textAnchor="middle" fontFamily="monospace">
            {d >= 1000 ? `${(d / 1000).toFixed(0)}km` : `${d}m`}
          </text>
        ))}

        {/* Legend */}
        {series.filter(s => s.label).map((s, si) => (
          <g key={si} transform={`translate(${CP.left + plotW - 80 * (series.filter(l => l.label).length - si)}, ${CP.top + 4})`}>
            <line x1={0} y1={5} x2={14} y2={5} stroke={s.color} strokeWidth={2} />
            <text x={17} y={9} fill={s.color} fontSize={9} fontFamily="sans-serif">{s.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Wheel chart helper ───────────────────────────────────────

const WHEEL_COLORS: Record<string, string> = { FL: '#00e5ff', FR: '#69ff47', RL: '#ff2d78', RR: '#ff9800' }

function WheelChart({ title, lapDist, data, yLabel, progress }: {
  title: string
  lapDist: number[]
  data: WheelChannels
  yLabel?: string
  progress?: number
}) {
  return (
    <MiniChart
      title={title}
      lapDist={lapDist}
      yLabel={yLabel}
      progress={progress}
      series={(['FL', 'FR', 'RL', 'RR'] as const).map(w => ({
        values: data[w],
        color: WHEEL_COLORS[w],
        label: w,
      }))}
    />
  )
}

// ── Main component ───────────────────────────────────────────

export default function TelemetryPanel({ sessionId, lapNumber, lapTimeMs, ghostTelemetry, progress }: Props) {
  const t = useT()
  const [inputs,  setInputs]  = useState<InputsData  | null>(null)
  const [engine,  setEngine]  = useState<EngineData  | null>(null)
  const [speeds,  setSpeeds]  = useState<SpeedsData  | null>(null)
  const [tyres,   setTyres]   = useState<TyresData   | null>(null)
  const [brakes,  setBrakes]  = useState<BrakesData  | null>(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setErr(null)
    setInputs(null); setEngine(null); setSpeeds(null); setTyres(null); setBrakes(null)

    const base = `/api/sessions/${sessionId}/laps/${lapNumber}`
    Promise.all([
      api.get(`${base}/inputs`),
      api.get(`${base}/engine`),
      api.get(`${base}/speeds`),
      api.get(`${base}/tyres`),
      api.get(`${base}/brakes`),
    ]).then(([inp, eng, spd, tyr, brk]) => {
      setInputs(inp.data)
      setEngine(eng.data)
      setSpeeds(spd.data)
      setTyres(tyr.data)
      setBrakes(brk.data)
      setLoading(false)
    }).catch(() => {
      setErr(t.telemetryError)
      setLoading(false)
    })
  }, [sessionId, lapNumber])

  function fmtMs(ms: number | null) {
    if (!ms) return '–'
    const m = Math.floor(ms / 60000)
    const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0')
    return `${m}:${s}`
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm gap-2">
      <Spinner /> {t.loadingTelemetry}
    </div>
  )

  if (err) return (
    <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">{err}</div>
  )

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-baseline gap-4">
        <span className="text-lg font-semibold font-mono text-lmu-accent">{fmtMs(lapTimeMs)}</span>
        <span className="text-xs text-gray-500">Lap {lapNumber}</span>
        {ghostTelemetry?.lap_time_ms && (
          <>
            <span className="text-gray-600">vs</span>
            <span className="text-lg font-semibold font-mono text-yellow-400">{fmtMs(ghostTelemetry.lap_time_ms)}</span>
            <span className="text-xs text-yellow-600">Best</span>
          </>
        )}
      </div>

      {/* Speed + ghost */}
      {speeds && (
        <MiniChart title={t.speed} lapDist={speeds.lap_dist} yLabel="km/h" height={110} progress={progress}
          series={[
            { values: speeds.channels.speed_kmh, color: '#00cfff', fill: true, label: 'Lap' },
            ...(ghostTelemetry ? [{
              values: resample(ghostTelemetry.lap_dist, ghostTelemetry.channels.speed_kmh, speeds.lap_dist),
              color: '#facc15', label: 'Best', fill: false,
            }] : []),
          ]}
        />
      )}

      {/* Throttle & Brake + ghost */}
      {inputs && (
        <MiniChart title="Throttle / Brake" lapDist={inputs.lap_dist} yLabel="%" height={80} progress={progress}
          series={[
            { values: inputs.channels.throttle.map(v => v ?? 0),   color: '#4ade80', fill: true, label: 'Throttle' },
            { values: inputs.channels.brake.map(v => -(v ?? 0)),   color: '#f43f5e', fill: true, label: 'Brake' },
            ...(ghostTelemetry ? [
              {
                values: resample(ghostTelemetry.lap_dist, ghostTelemetry.channels.throttle, inputs.lap_dist),
                color: '#facc15', fill: false, label: 'Thr (best)',
              },
              {
                values: resample(ghostTelemetry.lap_dist, ghostTelemetry.channels.brake, inputs.lap_dist).map(v => -v),
                color: '#ef4444', fill: false, label: 'Brk (best)',
              },
            ] : []),
          ]}
        />
      )}

      {/* Steering + ghost */}
      {inputs && (
        <MiniChart title="Steering" lapDist={inputs.lap_dist} yLabel="%" height={70} progress={progress}
          series={[
            { values: inputs.channels.steering.map(v => v ?? 0), color: '#f59e0b' },
            ...(ghostTelemetry ? [{
              values: resample(ghostTelemetry.lap_dist, ghostTelemetry.channels.steering, inputs.lap_dist),
              color: '#facc15', fill: false,
            }] : []),
          ]}
        />
      )}

      {/* RPM + Gear */}
      {engine && (
        <MiniChart title={t.rpmGear} lapDist={engine.lap_dist} yLabel="RPM" height={90} progress={progress}
          series={[
            { values: engine.channels.rpm,                                color: '#a78bfa', label: 'RPM' },
            { values: (engine.channels.gear as number[]).map(g => (g ?? 0) * 2000), color: '#f43f5e', label: 'Gear ×2k' },
          ]}
        />
      )}

      {/* G forces + ghost */}
      {speeds && (
        <MiniChart title="G-Forces" lapDist={speeds.lap_dist} yLabel="G" height={80} progress={progress}
          series={[
            { values: speeds.channels.g_lat, color: '#00cfff', label: 'G lat' },
            { values: speeds.channels.g_lon, color: '#f59e0b', label: 'G lon' },
            ...(ghostTelemetry ? [
              {
                values: resample(ghostTelemetry.lap_dist, ghostTelemetry.channels.g_lat, speeds.lap_dist),
                color: '#facc15', fill: false, label: 'G lat (best)',
              },
              {
                values: resample(ghostTelemetry.lap_dist, ghostTelemetry.channels.g_lon, speeds.lap_dist),
                color: '#fde68a', fill: false, label: 'G lon (best)',
              },
            ] : []),
            { values: speeds.channels.g_lon, color: '#f59e0b', label: 'G lon' },
          ]}
        />
      )}

      {/* Tyre rubber + carcass + rim temps */}
      {tyres && (
        <WheelChart title={t.rubberTemp} lapDist={tyres.lap_dist}
          data={tyres.channels.rubber_temp} yLabel="°C" progress={progress} />
      )}
      {tyres && (
        <WheelChart title={t.carcassTemp} lapDist={tyres.lap_dist}
          data={tyres.channels.carcass_temp} yLabel="°C" progress={progress} />
      )}
      {tyres && (
        <WheelChart title={t.rimTemp} lapDist={tyres.lap_dist}
          data={tyres.channels.rim_temp} yLabel="°C" progress={progress} />
      )}
      {tyres && (
        <WheelChart title={t.centreTemp} lapDist={tyres.lap_dist}
          data={tyres.channels.temp_centre} yLabel="°C" progress={progress} />
      )}
      {tyres && (
        <WheelChart title={t.leftTemp} lapDist={tyres.lap_dist}
          data={tyres.channels.temp_left} yLabel="°C" progress={progress} />
      )}
      {tyres && (
        <WheelChart title={t.rightTemp} lapDist={tyres.lap_dist}
          data={tyres.channels.temp_right} yLabel="°C" progress={progress} />
      )}
      {tyres && (
        <WheelChart title={t.tyrePressure} lapDist={tyres.lap_dist}
          data={tyres.channels.pressure} yLabel="kPa" progress={progress} />
      )}
      {tyres && (
        <WheelChart title={t.tyreWear} lapDist={tyres.lap_dist}
          data={tyres.channels.wear} yLabel="%" progress={progress} />
      )}
      {tyres && tyres.channels.slip_angle && (
        <MiniChart title="TC Slip Angle" lapDist={tyres.lap_dist} yLabel="rad" height={70} progress={progress}
          series={[{ values: tyres.channels.slip_angle.map(v => v ?? 0), color: '#f59e0b' }]}
        />
      )}

      {/* Brake temps */}
      {brakes && (
        <WheelChart title={t.brakeTemp} lapDist={brakes.lap_dist}
          data={brakes.channels.brake_temp} yLabel="°C" progress={progress} />
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
