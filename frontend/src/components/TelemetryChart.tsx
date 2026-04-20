import { useRef, useCallback, useEffect, useState } from 'react'
import { useT } from '../contexts/LanguageContext'

const ZOOM = 5
const W = 900
const H_FS   = 100
const H_NORM = 90
const CP_FS   = { top: 4,  right: 6,  bottom: 4,  left: 26 }
const CP_NORM = { top: 6,  right: 8,  bottom: 16, left: 32 }

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
  // data
  lapDist: number[]
  values: number[]
  maxVal?: number           // y-axis max; default 100 (use 1 for binary channels like TC)
  ghostDist?: (number | null)[]
  ghostVals?: (number | null)[]
  ghostColor?: string

  // appearance
  lineColor: string
  fillColor: string
  binaryBars?: boolean      // true → render filled rects (for binary 0/1 channels)

  // header
  label: string
  labelColor: string
  badge?: React.ReactNode   // optional extra element (e.g. "TC 7" level badge)
  showGhostLegend?: boolean

  // playback
  progress: number
  inFullscreen?: boolean
  onSeek?: (p: number) => void
}

export default function TelemetryChart({
  lapDist, values, maxVal = 100, ghostDist, ghostVals, ghostColor,
  lineColor, fillColor, binaryBars,
  label, labelColor, badge, showGhostLegend,
  progress, inFullscreen, onSeek,
}: Props) {
  const t = useT()
  const n = lapDist.length
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [overlay, setOverlay] = useState(true)

  const CP = inFullscreen ? CP_FS : CP_NORM
  const H  = inFullscreen ? H_FS  : H_NORM
  const plotW = W - CP.left - CP.right
  const plotH = H - CP.top - CP.bottom
  const maxDist = n >= 2 ? (lapDist[n - 1] || 1) : 1

  function px(d: number) { return CP.left + (d / maxDist) * plotW }
  function py(v: number) { return CP.top + plotH - (v / maxVal) * plotH }

  // Convert time-fraction progress [0,1] → distance by interpolating lap_dist
  function progressToDist(p: number): number {
    if (n < 2) return 0
    const exactIdx = p * (n - 1)
    const i0 = Math.floor(exactIdx)
    if (i0 >= n - 1) return lapDist[n - 1]
    const frac = exactIdx - i0
    return lapDist[i0] + frac * (lapDist[i0 + 1] - lapDist[i0])
  }

  // Convert distance → time-fraction [0,1] by finding index in lap_dist
  function distToProgress(d: number): number {
    if (n < 2) return 0
    // Binary search for the index bracket
    let lo = 0, hi = n - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (lapDist[mid] <= d) lo = mid; else hi = mid
    }
    const segLen = lapDist[hi] - lapDist[lo]
    const frac = segLen > 0 ? (d - lapDist[lo]) / segLen : 0
    return (lo + frac) / (n - 1)
  }

  const cursorDist = progressToDist(progress)

  const zooming = inFullscreen && progress > 0 && progress < 1
  let vbX = 0, vbW = W
  if (zooming) {
    const centerX = px(cursorDist)
    vbW = W / ZOOM
    vbX = centerX - vbW / 2
    if (vbX < 0) vbX = 0
    if (vbX + vbW > W) vbX = W - vbW
  }
  const viewBox = `${vbX.toFixed(1)} 0 ${vbW.toFixed(1)} ${H}`

  function progressFromSvg(e: React.MouseEvent | MouseEvent): number | null {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const svgX = vbX + ((e.clientX - rect.left) / rect.width) * vbW
    const d = ((svgX - CP.left) / plotW) * maxDist
    const clampedDist = Math.max(0, Math.min(maxDist, d))
    return Math.max(0, Math.min(1, distToProgress(clampedDist)))
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    const p = progressFromSvg(e)
    if (p !== null) onSeek?.(p)
    e.preventDefault()
  }, [onSeek, vbX, vbW, plotW, maxDist, CP.left])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const svgX = vbX + ((e.clientX - rect.left) / rect.width) * vbW
      const d = ((svgX - CP.left) / plotW) * maxDist
      const clampedDist = Math.max(0, Math.min(maxDist, d))
      onSeek?.(Math.max(0, Math.min(1, distToProgress(clampedDist))))
    }
    function onUp() { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [onSeek, vbX, vbW, plotW, maxDist, CP.left])

  if (n < 2) return null

  const len = Math.min(n, values.length)

  // ── Polyline data ──────────────────────────────────────────────────
  let mainPts = '', fillPath = '', ghostPts = ''
  if (!binaryBars) {
    mainPts = Array.from({ length: len }, (_, i) =>
      `${px(lapDist[i]).toFixed(1)},${py(values[i] ?? 0).toFixed(1)}`).join(' ')
    const segs = Array.from({ length: len }, (_, i) =>
      `L ${px(lapDist[i]).toFixed(1)},${py(values[i] ?? 0).toFixed(1)}`).join(' ')
    fillPath = `M ${px(lapDist[0]).toFixed(1)},${py(0).toFixed(1)} ${segs} L ${px(lapDist[len - 1]).toFixed(1)},${py(0).toFixed(1)} Z`
  }

  // Ghost polyline — applies to both continuous and binary charts
  if (ghostDist && ghostVals && ghostColor) {
    const resampled = resampleChannel(ghostDist, ghostVals, lapDist.slice(0, len))
    ghostPts = lapDist.slice(0, len).map((d, i) =>
      `${px(d).toFixed(1)},${py(resampled[i]).toFixed(1)}`).join(' ')
  }

  // ── Binary rects (TC, ABS, etc.) ───────────────────────────────────
  const rects: { x: number; w: number }[] = []
  if (binaryBars) {
    let segStart: number | null = null
    for (let i = 0; i < len; i++) {
      const active = (values[i] ?? 0) > 0.5
      if (active && segStart === null) { segStart = i }
      else if (!active && segStart !== null) {
        rects.push({ x: px(lapDist[segStart]), w: px(lapDist[i]) - px(lapDist[segStart]) })
        segStart = null
      }
    }
    if (segStart !== null)
      rects.push({ x: px(lapDist[segStart]), w: px(lapDist[len - 1]) - px(lapDist[segStart]) })
  }

  const cursorX = px(cursorDist)
  const showCursor = progress > 0
  const hasGhost = !!ghostPts
  const showSplit = !overlay && hasGhost

  // grid at 0, midpoint, max
  const gridVals = maxVal >= 10 ? [0, maxVal / 2, maxVal] : [0, maxVal]

  // x-axis ticks only in normal mode, only on bottom panel
  const xTicks: number[] = []
  if (!inFullscreen) {
    const xInterval = maxDist > 5000 ? 2000 : 1000
    for (let d = 0; d <= maxDist; d += xInterval) xTicks.push(d)
  }

  // Pixel heights
  const singlePx = inFullscreen ? 90 : undefined
  const splitPx  = inFullscreen ? 44 : 36

  function renderGrid() {
    return gridVals.map(v => (
      <line key={v}
        x1={CP.left} y1={py(v)} x2={CP.left + plotW} y2={py(v)}
        stroke="#fff"
        strokeOpacity={v === 0 ? 0.05 : v === maxVal ? 0.06 : 0.04}
        strokeWidth={0.5}
      />
    ))
  }
  function renderYLabels() {
    return gridVals.map(v => (
      <text key={v} x={CP.left - 3} y={py(v) + 3}
        fill="#6b7280" fontSize={7} textAnchor="end" fontFamily="monospace">{v}</text>
    ))
  }
  function renderCursor() {
    return showCursor ? (
      <line x1={cursorX} y1={CP.top} x2={cursorX} y2={CP.top + plotH}
        stroke="#fff" strokeWidth={inFullscreen ? 0.6 : 1.2} strokeOpacity={inFullscreen ? 0.5 : 0.8} />
    ) : null
  }
  function renderXTicks() {
    return xTicks.map(d => (
      <text key={d} x={px(d)} y={H - 3} fill="#4b5563" fontSize={8} textAnchor="middle" fontFamily="monospace">
        {d >= 1000 ? `${(d / 1000).toFixed(0)}km` : `${d}m`}
      </text>
    ))
  }
  function renderMainContent() {
    return (
      <>
        {binaryBars && rects.map((r, i) => (
          <rect key={i} x={r.x} y={CP.top} width={Math.max(r.w, 1)} height={plotH}
            fill={fillColor + '33'} stroke={lineColor} strokeWidth={0.5} />
        ))}
        {!binaryBars && (
          <>
            <path d={fillPath} fill={fillColor} fillOpacity={0.15} />
            <polyline points={mainPts} fill="none" stroke={lineColor} strokeWidth={1} />
          </>
        )}
      </>
    )
  }

  function makeSvg(content: React.ReactNode, showXTicks: boolean, pixelH?: number) {
    return (
      <svg viewBox={viewBox} preserveAspectRatio="none" width="100%"
        style={{ display: 'block', ...(pixelH != null ? { height: pixelH } : {}) }}>
        {renderGrid()}
        {content}
        {renderYLabels()}
        {showXTicks && renderXTicks()}
        {renderCursor()}
      </svg>
    )
  }

  // Toggle icon
  function ToggleIcon({ split }: { split: boolean }) {
    return split ? (
      // Two separate bars (split mode active)
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="12" height="5" rx="1" fill="currentColor" opacity="0.9" />
        <rect x="1" y="8" width="12" height="5" rx="1" fill="currentColor" opacity="0.9" />
      </svg>
    ) : (
      // Two overlapping bars (overlay mode active)
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="2" width="12" height="10" rx="1" fill="currentColor" opacity="0.35" />
        <rect x="1" y="4" width="12" height="6" rx="1" fill="currentColor" opacity="0.9" />
      </svg>
    )
  }

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden"
      style={{
        background: 'rgba(8,12,22,0.82)',
        backdropFilter: 'blur(6px)',
        cursor: onSeek ? 'crosshair' : 'default',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-2.5 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative' }}>
        <span className="flex items-center gap-1.5">
          {binaryBars
            ? <span style={{ width: 10, height: 10, borderRadius: 2, background: lineColor, display: 'inline-block', opacity: 0.85 }} />
            : <span style={{ width: 10, height: 2,  borderRadius: 1, background: lineColor, display: 'inline-block' }} />
          }
          <span style={{ color: labelColor, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em' }}>{label}</span>
        </span>
        {badge}
        {showGhostLegend && ghostColor && hasGhost && (
          <span className="flex items-center gap-1">
            <span style={{ width: 10, height: 0, borderTop: `2px dashed ${ghostColor}`, display: 'inline-block' }} />
            <span style={{ color: '#9ca3af', fontSize: 9 }}>Ghost</span>
          </span>
        )}
        {/* Overlay/split toggle — only when ghost data is present */}
        {hasGhost && ghostColor && (
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setOverlay(o => !o) }}
            title={overlay ? t.splitGhost : t.overlapGhost}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              padding: '2px 4px',
              cursor: 'pointer',
              color: overlay ? '#6b7280' : ghostColor,
              display: 'flex',
              alignItems: 'center',
              opacity: 0.75,
              borderRadius: 3,
            }}
          >
            <ToggleIcon split={showSplit} />
          </button>
        )}
      </div>

      {showSplit ? (
        // ── Split mode: ghost on top, current lap on bottom ──────────
        <>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: 3, right: CP.right + 2, fontSize: 7, color: ghostColor, fontFamily: 'monospace', fontWeight: 700, opacity: 0.6, zIndex: 1, pointerEvents: 'none' }}>GHOST</span>
            {makeSvg(
              <polyline points={ghostPts} fill="none" stroke={ghostColor} strokeWidth={1.2} strokeDasharray="4,2" opacity={0.85} />,
              false, splitPx
            )}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: 3, right: CP.right + 2, fontSize: 7, color: lineColor, fontFamily: 'monospace', fontWeight: 700, opacity: 0.6, zIndex: 1, pointerEvents: 'none' }}>{label}</span>
            {makeSvg(renderMainContent(), true, splitPx)}
          </div>
        </>
      ) : (
        // ── Overlay mode: single chart ────────────────────────────────
        makeSvg(
          <>
            {renderMainContent()}
            {ghostPts && (
              <polyline points={ghostPts} fill="none" stroke={ghostColor} strokeWidth={1.2} strokeDasharray="4,2" opacity={0.85} />
            )}
          </>,
          true, singlePx
        )
      )}
    </div>
  )
}
