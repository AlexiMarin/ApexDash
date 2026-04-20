interface Props {
  lapDist: number[]   // metres, one per sample
  speed: number[]     // km/h, same length
  progress: number    // 0–1
  width?: number
  height?: number
}

const PAD = { top: 16, right: 16, bottom: 28, left: 46 }

export default function SpeedChart({ lapDist, speed, progress, width = 900, height = 160 }: Props) {
  const n = Math.min(lapDist.length, speed.length)
  if (n < 2) return null

  const plotW = width  - PAD.left - PAD.right
  const plotH = height - PAD.top  - PAD.bottom

  const maxDist  = lapDist[n - 1] || 1
  const maxSpeed = Math.max(...speed) || 1
  const yTick    = maxSpeed > 250 ? 50 : 25

  // Projection helpers
  function px(d: number) { return PAD.left + (d / maxDist) * plotW }
  function py(v: number) { return PAD.top  + plotH - (v / maxSpeed) * plotH }

  // Build speed polyline + filled area
  const pts = Array.from({ length: n }, (_, i) =>
    `${px(lapDist[i]).toFixed(1)},${py(speed[i]).toFixed(1)}`
  ).join(' ')

  const areaPath =
    `M ${px(lapDist[0]).toFixed(1)},${py(0).toFixed(1)} ` +
    Array.from({ length: n }, (_, i) =>
      `L ${px(lapDist[i]).toFixed(1)},${py(speed[i]).toFixed(1)}`
    ).join(' ') +
    ` L ${px(lapDist[n - 1]).toFixed(1)},${py(0).toFixed(1)} Z`

  // Cursor index from progress
  const idx      = Math.min(Math.floor(progress * (n - 1)), n - 1)
  const cursorX  = px(lapDist[idx])
  const cursorSpd = speed[idx] ?? 0

  // Y-axis ticks
  const yTicks: number[] = []
  for (let v = 0; v <= maxSpeed; v += yTick) yTicks.push(v)

  // X-axis ticks every ~1 km
  const xTickInterval = maxDist > 5000 ? 2000 : 1000
  const xTicks: number[] = []
  for (let d = 0; d <= maxDist; d += xTickInterval) xTicks.push(d)

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ background: '#111318', borderRadius: 8, display: 'block' }}
    >
      {/* Grid lines */}
      {yTicks.map(v => (
        <line
          key={v}
          x1={PAD.left} y1={py(v)}
          x2={PAD.left + plotW} y2={py(v)}
          stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1}
        />
      ))}

      {/* Speed area fill */}
      <path d={areaPath} fill="#00cfff" fillOpacity={0.12} />

      {/* Speed line */}
      <polyline points={pts} fill="none" stroke="#00cfff" strokeWidth={1.4} opacity={0.9} />

      {/* Cursor */}
      {progress > 0 && (
        <>
          <line
            x1={cursorX} y1={PAD.top}
            x2={cursorX} y2={PAD.top + plotH}
            stroke="#facc15" strokeWidth={1.2}
          />
          <circle
            cx={cursorX} cy={py(cursorSpd)}
            r={4} fill="#facc15" stroke="#fff" strokeWidth={1.2}
          />
          <text
            x={Math.min(cursorX + 6, PAD.left + plotW - 50)}
            y={py(cursorSpd) - 6}
            fill="#facc15"
            fontSize={11}
            fontFamily="monospace"
          >
            {cursorSpd.toFixed(0)} km/h
          </text>
        </>
      )}

      {/* Y-axis labels */}
      {yTicks.filter(v => v > 0).map(v => (
        <text
          key={v}
          x={PAD.left - 4} y={py(v) + 4}
          fill="#6b7280" fontSize={10} textAnchor="end" fontFamily="monospace"
        >
          {v}
        </text>
      ))}

      {/* X-axis labels */}
      {xTicks.map(d => (
        <text
          key={d}
          x={px(d)} y={height - 4}
          fill="#6b7280" fontSize={10} textAnchor="middle" fontFamily="monospace"
        >
          {d >= 1000 ? `${(d / 1000).toFixed(0)}km` : `${d}m`}
        </text>
      ))}

      {/* Y-axis title */}
      <text
        x={10} y={PAD.top + plotH / 2}
        fill="#6b7280" fontSize={10} textAnchor="middle"
        transform={`rotate(-90, 10, ${PAD.top + plotH / 2})`}
        fontFamily="sans-serif"
      >
        km/h
      </text>
    </svg>
  )
}
