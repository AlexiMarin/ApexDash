// Top-down SVG: body rotates by β (slip angle), front wheels steer by β
import BetaBadge from './BetaBadge'
export default function SlipAngleCar({ beta, ghostBeta }: { beta: number; ghostBeta?: number }) {
  const displayed = Math.max(-15, Math.min(15, beta))
  const absB = Math.abs(displayed)
  const c = absB < 1.5 ? '#4ade80' : absB < 4 ? '#facc15' : '#f87171'
  const label = displayed >= 0 ? `+${displayed.toFixed(1)}°` : `${displayed.toFixed(1)}°`

  const ghostDisplayed = ghostBeta != null ? Math.max(-15, Math.min(15, ghostBeta)) : null

  // Front wheels steer opposite to β
  const ws = Math.max(-25, Math.min(25, -displayed * (25 / 15)))
  const gwS = ghostDisplayed != null ? Math.max(-25, Math.min(25, -ghostDisplayed * (25 / 15))) : 0
  const cx = 60, cy = 95

  // Wheel geometry
  const wW = 8, fH = 16, rH = 18
  const fY = 34, rY = 105         // front / rear wheel Y centres
  const fTr = 22, rTr = 23        // front / rear half-track

  return (
    <div style={{
      background: 'rgba(8,12,22,0.82)', backdropFilter: 'blur(6px)',
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
      padding: '6px 10px', textAlign: 'center', userSelect: 'none',
      width: '100%', boxSizing: 'border-box', position: 'relative',
    }}>
      <BetaBadge />
      <p style={{ color: '#6b7280', fontSize: 9, letterSpacing: '0.12em',
        textTransform: 'uppercase', margin: 0, marginBottom: 3 }}>SLIP</p>

      <svg viewBox="0 0 120 185" width="100%" height={235} style={{ display: 'block', margin: '0 auto' }}>
        <defs>
          <marker id="sArr" markerWidth="5" markerHeight="4" refX="2.5" refY="2" orient="auto">
            <polygon points="0 0,5 2,0 4" fill="rgba(255,255,255,0.22)" /></marker>
          <linearGradient id="sT" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#18182b" />
            <stop offset="50%" stopColor="#2a2a42" />
            <stop offset="100%" stopColor="#18182b" />
          </linearGradient>
        </defs>

        {/* Velocity vector — fixed, always pointing up */}
        <line x1={cx} y1={cy + 60} x2={cx} y2={cy - 68}
          stroke="rgba(255,255,255,0.15)" strokeWidth={1.2} strokeDasharray="3 2"
          markerEnd="url(#sArr)" />

        {/* ── Ghost car outline ─────────────────────── */}
        {ghostDisplayed != null && (
          <g transform={`rotate(${-ghostDisplayed},${cx},${cy})`} opacity={0.28}>
            <path d={`
              M${cx - 8},15 L${cx + 8},15
              Q${cx + 14},18 ${cx + 16},28 L${cx + 16},42
              Q${cx + 17},50 ${cx + 18},55 L${cx + 18},85 L${cx + 18},118
              Q${cx + 16},127 ${cx + 10},130 L${cx - 10},130
              Q${cx - 16},127 ${cx - 18},118 L${cx - 18},85
              L${cx - 18},55 Q${cx - 17},50 ${cx - 16},42
              L${cx - 16},28 Q${cx - 14},18 ${cx - 8},15 Z
            `} fill="none" stroke="#facc15" strokeWidth={1.2} />
            <rect x={cx - rTr - wW / 2} y={rY - rH / 2} width={wW} height={rH} rx={2}
              fill="none" stroke="#facc15" strokeWidth={0.9} />
            <rect x={cx + rTr - wW / 2} y={rY - rH / 2} width={wW} height={rH} rx={2}
              fill="none" stroke="#facc15" strokeWidth={0.9} />
            <g transform={`rotate(${gwS},${cx - fTr},${fY})`}>
              <rect x={cx - fTr - wW / 2} y={fY - fH / 2} width={wW} height={fH} rx={2}
                fill="none" stroke="#facc15" strokeWidth={0.9} />
            </g>
            <g transform={`rotate(${gwS},${cx + fTr},${fY})`}>
              <rect x={cx + fTr - wW / 2} y={fY - fH / 2} width={wW} height={fH} rx={2}
                fill="none" stroke="#facc15" strokeWidth={0.9} />
            </g>
          </g>
        )}

        {/* ── Car body — rotates by -β around CG ──────── */}
        <g transform={`rotate(${-displayed},${cx},${cy})`}>

          {/* Rear fender flares (wider haunches) */}
          <path d={`
            M${cx - 18},${85}
            Q${cx - 26},${88} ${cx - 26},${100}
            Q${cx - 26},${116} ${cx - 18},${118}
          `} fill="none" stroke={c} strokeWidth={0.9} opacity={0.5} />
          <path d={`
            M${cx + 18},${85}
            Q${cx + 26},${88} ${cx + 26},${100}
            Q${cx + 26},${116} ${cx + 18},${118}
          `} fill="none" stroke={c} strokeWidth={0.9} opacity={0.5} />

          <path d={`
            M${cx - 8},15
            L${cx + 8},15
            Q${cx + 14},18 ${cx + 16},28
            L${cx + 16},42
            Q${cx + 17},50 ${cx + 18},55
            L${cx + 18},85
            L${cx + 18},118
            Q${cx + 16},127 ${cx + 10},130
            L${cx - 10},130
            Q${cx - 16},127 ${cx - 18},118
            L${cx - 18},85
            L${cx - 18},55
            Q${cx - 17},50 ${cx - 16},42
            L${cx - 16},28
            Q${cx - 14},18 ${cx - 8},15
            Z
          `} fill={`${c}12`} stroke={c} strokeWidth={1} />

          {/* Front hood crease lines */}
          <line x1={cx - 5} y1={20} x2={cx - 6} y2={40}
            stroke={c} strokeWidth={0.4} opacity={0.25} />
          <line x1={cx + 5} y1={20} x2={cx + 6} y2={40}
            stroke={c} strokeWidth={0.4} opacity={0.25} />

          {/* Front splitter */}
          <rect x={cx - 15} y={12} width={30} height={3} rx={1}
            fill={`${c}25`} stroke={c} strokeWidth={0.7} />

          {/* Headlights */}
          <ellipse cx={cx - 10} cy={22} rx={3.5} ry={1.5}
            fill={`${c}18`} stroke={c} strokeWidth={0.5} />
          <ellipse cx={cx + 10} cy={22} rx={3.5} ry={1.5}
            fill={`${c}18`} stroke={c} strokeWidth={0.5} />

          {/* Side air intakes (behind front wheels) */}
          <rect x={cx - 19} y={52} width={3} height={8} rx={1}
            fill={`${c}15`} stroke={c} strokeWidth={0.5} />
          <rect x={cx + 16} y={52} width={3} height={8} rx={1}
            fill={`${c}15`} stroke={c} strokeWidth={0.5} />

          {/* Side mirrors */}
          <ellipse cx={cx - 19} cy={44} rx={2.5} ry={1.5}
            fill={`${c}20`} stroke={c} strokeWidth={0.5} />
          <ellipse cx={cx + 19} cy={44} rx={2.5} ry={1.5}
            fill={`${c}20`} stroke={c} strokeWidth={0.5} />

          {/* Windshield */}
          <path d={`
            M${cx - 12},46
            Q${cx},43 ${cx + 12},46
            L${cx + 11},56
            Q${cx},54 ${cx - 11},56
            Z
          `} fill="#0c1020" stroke={c} strokeWidth={0.6} opacity={0.65} />

          {/* Cockpit / roof */}
          <path d={`
            M${cx - 11},56
            Q${cx},54 ${cx + 11},56
            L${cx + 10},76
            Q${cx},78 ${cx - 10},76
            Z
          `} fill="#0a0e1a" stroke={c} strokeWidth={0.5} opacity={0.5} />

          {/* Rear window */}
          <path d={`
            M${cx - 10},76
            Q${cx},78 ${cx + 10},76
            L${cx + 8},84
            Q${cx},86 ${cx - 8},84
            Z
          `} fill="#0c1020" stroke={c} strokeWidth={0.5} opacity={0.45} />

          {/* Engine cover vents (behind cockpit) */}
          {[-4, 0, 4].map((dy) => (
            <line key={dy} x1={cx - 6} y1={88 + dy} x2={cx + 6} y2={88 + dy}
              stroke={c} strokeWidth={0.35} opacity={0.2} />
          ))}

          {/* Rear light bar */}
          <rect x={cx - 14} y={128} width={28} height={2} rx={1}
            fill="rgba(255,30,30,0.45)" stroke="rgba(255,60,60,0.35)" strokeWidth={0.4} />

          {/* Rear wing — swan-neck */}
          <line x1={cx - 10} y1={126} x2={cx - 12} y2={134}
            stroke={c} strokeWidth={1} opacity={0.4} />
          <line x1={cx + 10} y1={126} x2={cx + 12} y2={134}
            stroke={c} strokeWidth={1} opacity={0.4} />
          <rect x={cx - 30} y={134} width={60} height={4.5} rx={1.5}
            fill={`${c}18`} stroke={c} strokeWidth={0.8} />
          {/* Endplates */}
          <rect x={cx - 32} y={132} width={3} height={9} rx={0.8}
            fill={`${c}15`} stroke={c} strokeWidth={0.5} />
          <rect x={cx + 29} y={132} width={3} height={9} rx={0.8}
            fill={`${c}15`} stroke={c} strokeWidth={0.5} />

          {/* Exhaust tips */}
          <ellipse cx={cx - 6} cy={131} rx={2} ry={1.2}
            fill="#0e0e18" stroke="rgba(255,255,255,0.1)" strokeWidth={0.4} />
          <ellipse cx={cx + 6} cy={131} rx={2} ry={1.2}
            fill="#0e0e18" stroke="rgba(255,255,255,0.1)" strokeWidth={0.4} />

          {/* ── Rear tyres (fixed) ─────────────────────── */}
          <rect x={cx - rTr - wW / 2} y={rY - rH / 2} width={wW} height={rH} rx={2}
            fill="url(#sT)" stroke={`${c}55`} strokeWidth={0.8} />
          <rect x={cx + rTr - wW / 2} y={rY - rH / 2} width={wW} height={rH} rx={2}
            fill="url(#sT)" stroke={`${c}55`} strokeWidth={0.8} />

          {/* ── Front tyres (steer) ────────────────────── */}
          <g transform={`rotate(${ws},${cx - fTr},${fY})`}>
            <rect x={cx - fTr - wW / 2} y={fY - fH / 2} width={wW} height={fH} rx={2}
              fill="url(#sT)" stroke={`${c}55`} strokeWidth={0.8} />
          </g>
          <g transform={`rotate(${ws},${cx + fTr},${fY})`}>
            <rect x={cx + fTr - wW / 2} y={fY - fH / 2} width={wW} height={fH} rx={2}
              fill="url(#sT)" stroke={`${c}55`} strokeWidth={0.8} />
          </g>

          {/* CG dot */}
          <circle cx={cx} cy={cy} r={1.5} fill={c} opacity={0.4} />
        </g>
      </svg>

      <p style={{ color: c, fontFamily: 'monospace', fontWeight: 700, fontSize: 15,
        margin: 0, lineHeight: 1.2 }}>{label}</p>
    </div>
  )
}
