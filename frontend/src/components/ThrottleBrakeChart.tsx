import { useRef, useCallback, useEffect } from 'react'
import type { GhostTelemetry } from './TelemetryPanel'

const TB_ZOOM = 5

function resampleChannel(
  ghostDist: (number | null)[],
  ghostVals: (number | null)[],
  targetDist: number[],
): number[] {
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
  const gMin = pts[0][0], gRange = (pts[pts.length - 1][0] - gMin) || 1
  const tMin = targetDist[0] ?? 0, tRange = (targetDist[targetDist.length - 1] - tMin) || 1
  return targetDist.map(td => {
    const f = (td - tMin) / tRange
    const gd = gMin + f * gRange
    if (gd <= pts[0][0]) return pts[0][1]
    let lo = 0, hi = pts.length - 1
    if (gd >= pts[hi][0]) return pts[hi][1]
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= gd) lo = mid; else hi = mid }
    const span = pts[hi][0] - pts[lo][0] || 1
    const t = (gd - pts[lo][0]) / span
    return pts[lo][1] + t * (pts[hi][1] - pts[lo][1])
  })
}

interface Props {
  lapDist: number[]
  throttle: number[]
  brake: number[]
  progress: number
  inFullscreen?: boolean
  ghostTelemetry?: GhostTelemetry | null
  onSeek?: (p: number) => void
}

export default function ThrottleBrakeChart({
  lapDist, throttle, brake, progress, inFullscreen, ghostTelemetry, onSeek,
}: Props) {
  const n = lapDist.length
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const W = 900
  const H_PANEL = 100
  const H_COMBO = 110
  const CP_PLAY  = { top: 4, right: 6, bottom: 4, left: 26 }
  const CP_PAUSE = { top: 6, right: 8, bottom: 18, left: 32 }
  const CP = inFullscreen ? CP_PLAY : CP_PAUSE
  const H = inFullscreen ? H_PANEL : H_COMBO
  const plotW = W - CP.left - CP.right
  const plotH = H - CP.top - CP.bottom
  const maxDist = n >= 2 ? (lapDist[n - 1] || 1) : 1

  function px(d: number) { return CP.left + (d / maxDist) * plotW }
  function py(v: number) { return CP.top + plotH - (v / 100) * plotH }

  const zooming = inFullscreen && progress > 0 && progress < 1
  let vbX = 0, vbW = W
  if (zooming) {
    const centerX = px(progress * maxDist)
    vbW = W / TB_ZOOM
    vbX = centerX - vbW / 2
    if (vbX < 0) vbX = 0
    if (vbX + vbW > W) vbX = W - vbW
  }
  const viewBox = `${vbX.toFixed(1)} 0 ${vbW.toFixed(1)} ${H}`

  function progressFromDiv(e: React.MouseEvent | MouseEvent) {
    const el = containerRef.current
    if (!el) return null
    const svg = (el as HTMLElement).querySelector('svg')
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const svgX = vbX + (relX / rect.width) * vbW
    const d = ((svgX - CP.left) / plotW) * maxDist
    return Math.max(0, Math.min(1, d / maxDist))
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    const p = progressFromDiv(e)
    if (p !== null) onSeek?.(p)
    e.preventDefault()
  }, [onSeek, vbX, vbW, plotW, maxDist, CP.left])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const el = containerRef.current
      if (!el) return
      const svg = (el as HTMLElement).querySelector('svg')
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const relX = e.clientX - rect.left
      const svgX = vbX + (relX / rect.width) * vbW
      const d = ((svgX - CP.left) / plotW) * maxDist
      onSeek?.(Math.max(0, Math.min(1, d / maxDist)))
    }
    function onUp() { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [onSeek, vbX, vbW, plotW, maxDist, CP.left])

  if (n < 2) return null

  const len = Math.min(n, throttle.length, brake.length)

  function makePts(vals: number[]) {
    return Array.from({ length: len }, (_, i) =>
      `${px(lapDist[i]).toFixed(1)},${py(vals[i] ?? 0).toFixed(1)}`).join(' ')
  }
  function makeFill(vals: number[]) {
    const pts = Array.from({ length: len }, (_, i) =>
      `L ${px(lapDist[i]).toFixed(1)},${py(vals[i] ?? 0).toFixed(1)}`).join(' ')
    return `M ${px(lapDist[0]).toFixed(1)},${py(0).toFixed(1)} ${pts} L ${px(lapDist[len - 1]).toFixed(1)},${py(0).toFixed(1)} Z`
  }

  const thrPts  = makePts(throttle)
  const brkPts  = makePts(brake)
  const thrFill = makeFill(throttle)
  const brkFill = makeFill(brake)

  let gThrPts = '', gBrkPts = ''
  if (ghostTelemetry) {
    const gThr = resampleChannel(ghostTelemetry.lap_dist, ghostTelemetry.channels.throttle, lapDist.slice(0, len))
    const gBrk = resampleChannel(ghostTelemetry.lap_dist, ghostTelemetry.channels.brake, lapDist.slice(0, len))
    gThrPts = lapDist.slice(0, len).map((d, i) => `${px(d).toFixed(1)},${py(gThr[i]).toFixed(1)}`).join(' ')
    gBrkPts = lapDist.slice(0, len).map((d, i) => `${px(d).toFixed(1)},${py(gBrk[i]).toFixed(1)}`).join(' ')
  }

  const cursorX = px(progress * maxDist)
  const showCursor = progress > 0

  function gridLines() {
    return (
      <>
        <line x1={CP.left} y1={py(100)} x2={CP.left + plotW} y2={py(100)} stroke="#fff" strokeOpacity={0.06} strokeWidth={0.5} />
        <line x1={CP.left} y1={py(50)}  x2={CP.left + plotW} y2={py(50)}  stroke="#fff" strokeOpacity={0.04} strokeWidth={0.5} />
        <line x1={CP.left} y1={py(0)}   x2={CP.left + plotW} y2={py(0)}   stroke="#fff" strokeOpacity={0.05} strokeWidth={0.5} />
      </>
    )
  }
  function yLabels() {
    return (
      <>
        <text x={CP.left - 3} y={py(100) + 3} fill="#6b7280" fontSize={7} textAnchor="end" fontFamily="monospace">100</text>
        <text x={CP.left - 3} y={py(50)  + 3} fill="#6b7280" fontSize={7} textAnchor="end" fontFamily="monospace">50</text>
        <text x={CP.left - 3} y={py(0)   + 3} fill="#6b7280" fontSize={7} textAnchor="end" fontFamily="monospace">0</text>
      </>
    )
  }

  // ── Two stacked panels when in fullscreen overlay ─────────────────
  if (inFullscreen) {
    function channelSvg(
      pts: string, fillD: string, gPts: string,
      lineColor: string, fillColor: string, ghostColor: string,
      channelLabel: string,
    ) {
      return (
        <svg viewBox={viewBox} preserveAspectRatio="none" width="100%"
          style={{ display: 'block', height: 90, cursor: onSeek ? 'crosshair' : 'default' }}>
          {gridLines()}
          <path d={fillD} fill={fillColor} fillOpacity={0.15} />
          <polyline points={pts} fill="none" stroke={lineColor} strokeWidth={1} />
          {gPts && (
            <polyline points={gPts} fill="none" stroke={ghostColor} strokeWidth={1.2}
              strokeDasharray="4,2" opacity={0.85} />
          )}
          {showCursor && (
            <line x1={cursorX} y1={CP.top} x2={cursorX} y2={CP.top + plotH}
              stroke="#fff" strokeWidth={0.6} strokeOpacity={0.5} />
          )}
          {yLabels()}
          <text x={CP.left + plotW - 2} y={CP.top + 8} fill={lineColor} fontSize={8}
            textAnchor="end" fontFamily="monospace" fontWeight="bold" opacity={0.5}>{channelLabel}</text>
        </svg>
      )
    }

    return (
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden"
        style={{ background: 'rgba(8,12,22,0.82)', backdropFilter: 'blur(6px)' }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-3 px-2.5 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <span className="flex items-center gap-1">
            <span style={{ width: 10, height: 2, borderRadius: 1, background: '#4ade80', display: 'inline-block' }} />
            <span style={{ color: '#4ade80', fontSize: 9 }}>THR</span>
          </span>
          <span className="flex items-center gap-1">
            <span style={{ width: 10, height: 2, borderRadius: 1, background: '#f87171', display: 'inline-block' }} />
            <span style={{ color: '#f87171', fontSize: 9 }}>BRK</span>
          </span>
          {ghostTelemetry && (
            <span className="flex items-center gap-1">
              <span style={{ width: 10, height: 0, borderTop: '2px dashed #facc15', display: 'inline-block' }} />
              <span style={{ color: '#9ca3af', fontSize: 9 }}>Ghost</span>
            </span>
          )}
        </div>
        {channelSvg(thrPts, thrFill, gThrPts, '#4ade80', '#22c55e', '#facc15', 'THR')}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />
        {channelSvg(brkPts, brkFill, gBrkPts, '#f87171', '#ef4444', '#fb923c', 'BRK')}
      </div>
    )
  }

  // ── Combined chart when paused (below map) ────────────────────────────────
  const xInterval = maxDist > 5000 ? 2000 : 1000
  const xTicks: number[] = []
  for (let d = 0; d <= maxDist; d += xInterval) xTicks.push(d)

  return (
    <div
      ref={containerRef}
      className="rounded-lg mt-1"
      style={{ background: 'rgba(10,14,26,0.82)', cursor: onSeek ? 'pointer' : 'default' }}
      onMouseDown={handleMouseDown}
    >
      <svg viewBox={viewBox} width="100%" style={{ display: 'block' }}>
        {gridLines()}
        <path d={thrFill} fill="#22c55e" fillOpacity={0.12} />
        <path d={brkFill} fill="#ef4444" fillOpacity={0.12} />
        <polyline points={thrPts} fill="none" stroke="#4ade80" strokeWidth={0.8} opacity={0.85} />
        <polyline points={brkPts} fill="none" stroke="#f87171" strokeWidth={0.8} opacity={0.85} />
        {ghostTelemetry && (
          <>
            <polyline points={gThrPts} fill="none" stroke="#facc15" strokeWidth={0.8} opacity={0.65} strokeDasharray="3,1.5" />
            <polyline points={gBrkPts} fill="none" stroke="#fb923c" strokeWidth={0.8} opacity={0.65} strokeDasharray="3,1.5" />
          </>
        )}
        {showCursor && (
          <line x1={cursorX} y1={CP.top} x2={cursorX} y2={CP.top + plotH}
            stroke="#fff" strokeWidth={1.2} strokeOpacity={0.8} />
        )}
        {yLabels()}
        {xTicks.map(d => (
          <text key={d} x={px(d)} y={H - 3} fill="#4b5563" fontSize={8} textAnchor="middle" fontFamily="monospace">
            {d >= 1000 ? `${(d / 1000).toFixed(0)}km` : `${d}m`}
          </text>
        ))}
        <g transform={`translate(${CP.left + 4}, ${CP.top + 2})`}>
          <line x1={0} y1={5} x2={12} y2={5} stroke="#4ade80" strokeWidth={1.5} />
          <text x={15} y={8} fill="#4ade80" fontSize={7} fontFamily="sans-serif">THR</text>
          <line x1={44} y1={5} x2={56} y2={5} stroke="#f87171" strokeWidth={1.5} />
          <text x={59} y={8} fill="#f87171" fontSize={7} fontFamily="sans-serif">BRK</text>
          {ghostTelemetry && (
            <>
              <line x1={88} y1={5} x2={100} y2={5} stroke="#facc15" strokeWidth={1.2} strokeDasharray="3,1.5" />
              <text x={103} y={8} fill="#facc15" fontSize={7} fontFamily="sans-serif">Ghost</text>
            </>
          )}
        </g>
      </svg>
    </div>
  )
}
