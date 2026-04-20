import { useRef, useEffect } from 'react'

const TC_ZOOM = 5
const TC_COLOR = '#f97316'   // orange-500
const TC_FILL  = '#f9731622'

interface Props {
  lapDist: number[]
  tc: number[]               // 0 or 1 per sample
  tcLevel?: number | null    // setting (e.g. 6)
  progress: number
  inFullscreen?: boolean
  onSeek?: (p: number) => void
}

export default function TCChart({ lapDist, tc, tcLevel, progress, inFullscreen, onSeek }: Props) {
  const n = lapDist.length
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const W = 900
  const H_FS   = 100   // matches ThrottleBrakeChart H_PANEL
  const H_NORM = 64    // total SVG coordinate height in normal mode
  const CP_FS   = { top: 4,  right: 6,  bottom: 4,  left: 26 }
  const CP_NORM = { top: 4,  right: 8,  bottom: 14, left: 32 }
  const CP = inFullscreen ? CP_FS : CP_NORM
  const H  = inFullscreen ? H_FS  : H_NORM

  // Rendered pixel heights (fixed, independent of content)
  const SVG_PX = inFullscreen ? 90 : 44

  const plotW   = W - CP.left - CP.right
  const plotH   = H - CP.top  - CP.bottom
  const maxDist = n >= 2 ? (lapDist[n - 1] || 1) : 1

  function px(d: number) { return CP.left + (d / maxDist) * plotW }
  function py(v: number) { return CP.top + plotH - v * plotH }   // v is 0 or 1

  // Same zoom logic as ThrottleBrakeChart
  const zooming = inFullscreen && progress > 0 && progress < 1
  let vbX = 0, vbW = W
  if (zooming) {
    const centerX = px(progress * maxDist)
    vbW = W / TC_ZOOM
    vbX = centerX - vbW / 2
    if (vbX < 0) vbX = 0
    if (vbX + vbW > W) vbX = W - vbW
  }
  const viewBox = `${vbX.toFixed(1)} 0 ${vbW.toFixed(1)} ${H}`

  // Seek helpers
  function progressFromEvent(e: React.MouseEvent | MouseEvent): number | null {
    const el = containerRef.current?.querySelector('svg') as SVGSVGElement | null
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const relX = e.clientX - rect.left
    const svgX = vbX + (relX / rect.width) * vbW
    const d = ((svgX - CP.left) / plotW) * maxDist
    return Math.max(0, Math.min(1, d / maxDist))
  }

  function handleMouseDown(e: React.MouseEvent) {
    dragging.current = true
    const p = progressFromEvent(e)
    if (p !== null) onSeek?.(p)
    e.preventDefault()
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      const el = containerRef.current?.querySelector('svg') as SVGSVGElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
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

  const len = Math.min(n, tc.length)

  // Build filled rectangles for each TC=1 segment
  const rects: { x: number; w: number }[] = []
  let segStart: number | null = null
  for (let i = 0; i < len; i++) {
    const active = (tc[i] ?? 0) > 0.5
    if (active && segStart === null) {
      segStart = i
    } else if (!active && segStart !== null) {
      rects.push({ x: px(lapDist[segStart]), w: px(lapDist[i]) - px(lapDist[segStart]) })
      segStart = null
    }
  }
  if (segStart !== null) {
    rects.push({ x: px(lapDist[segStart]), w: px(lapDist[len - 1]) - px(lapDist[segStart]) })
  }

  const cursorX = px(progress * maxDist)
  const showCursor = progress > 0

  // x-axis distance ticks (only in normal mode)
  const xInterval = maxDist > 5000 ? 2000 : 1000
  const xTicks: number[] = []
  if (!inFullscreen) {
    for (let d = 0; d <= maxDist; d += xInterval) xTicks.push(d)
  }

  const levelLabel = tcLevel != null ? `TC ${tcLevel}` : 'TC'

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
      {/* Header — TC level badge */}
      <div className="flex items-center gap-3 px-2.5 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 10, height: 10, borderRadius: 2, background: TC_COLOR, display: 'inline-block', opacity: 0.85 }} />
          <span style={{ color: TC_COLOR, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em' }}>TC</span>
        </span>
        <span style={{
          color: TC_COLOR, fontFamily: 'monospace', fontWeight: 700,
          fontSize: 11, background: 'rgba(249,115,22,0.15)',
          borderRadius: 4, padding: '1px 6px', border: '1px solid rgba(249,115,22,0.3)',
        }}>
          {levelLabel}
        </span>
      </div>

      <svg
        viewBox={viewBox}
        preserveAspectRatio="none"
        width="100%"
        style={{ display: 'block', height: SVG_PX }}
      >
        {/* Background grid line */}
        <line x1={CP.left} y1={py(0)} x2={CP.left + plotW} y2={py(0)}
          stroke="#fff" strokeOpacity={0.05} strokeWidth={0.5} />
        <line x1={CP.left} y1={py(1)} x2={CP.left + plotW} y2={py(1)}
          stroke={TC_COLOR} strokeOpacity={0.2} strokeWidth={0.5} />

        {/* TC intervention bands */}
        {rects.map((r, i) => (
          <rect key={i}
            x={r.x} y={CP.top} width={Math.max(r.w, 1)} height={plotH}
            fill={TC_FILL} stroke={TC_COLOR} strokeWidth={0.5} />
        ))}

        {/* y-axis labels */}
        <text x={CP.left - 3} y={py(1) + 3} fill="#6b7280" fontSize={7} textAnchor="end" fontFamily="monospace">1</text>
        <text x={CP.left - 3} y={py(0) + 3} fill="#6b7280" fontSize={7} textAnchor="end" fontFamily="monospace">0</text>

        {/* x-axis distance ticks (normal mode) */}
        {xTicks.map(d => (
          <text key={d} x={px(d)} y={H - 3} fill="#4b5563" fontSize={8} textAnchor="middle" fontFamily="monospace">
            {d >= 1000 ? `${(d / 1000).toFixed(0)}km` : `${d}m`}
          </text>
        ))}

        {/* Progress cursor */}
        {showCursor && (
          <line x1={cursorX} y1={CP.top} x2={cursorX} y2={CP.top + plotH}
            stroke="#fff" strokeWidth={inFullscreen ? 0.6 : 1.2}
            strokeOpacity={inFullscreen ? 0.5 : 0.8} />
        )}
      </svg>
    </div>
  )
}
