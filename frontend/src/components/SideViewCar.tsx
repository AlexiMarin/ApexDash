// Side-view — shows front + rear wheel of one side
// `side` prop flips SVG for left vs right
import { computeSidePhysics, coilPath } from './carPhysics'
import BetaBadge from './BetaBadge'

export default function SideViewCar({
  side,
  gLon = 0,
  gVert,
  suspF,
  suspR,
  rideHeightF,
  rideHeightR,
  ghostGLon,
  ghostGVert,
  ghostSuspF,
  ghostSuspR,
  ghostRideHeightF,
  ghostRideHeightR,
}: {
  side: 'L' | 'R'
  gLon: number
  gVert?: number | null
  suspF?: number | null
  suspR?: number | null
  rideHeightF?: number | null
  rideHeightR?: number | null
  ghostGLon?: number | null
  ghostGVert?: number | null
  ghostSuspF?: number | null
  ghostSuspR?: number | null
  ghostRideHeightF?: number | null
  ghostRideHeightR?: number | null
}) {
  // ── Physics (see carPhysics.ts) ────────────────────────────────────────
  const p = computeSidePhysics({ gLon, gVert, suspF, suspR, rideHeightF, rideHeightR })
  const {
    sf, sr, pitchDeg, gc, cF, cR,
    hFy, hRy, liftF, liftR,
    BY, sfMm, srMm, pitchLbl, gLbl,
    rsFx, rsFy, rsRx, rsRy,
  } = p
  const absG = Math.abs(gLon)
  const rhF = rideHeightF ?? 0.055
  const rhR = rideHeightR ?? 0.055
  const coil = coilPath

  // ── Ghost physics ──────────────────────────────────────────────────────
  const hasGhost = ghostGLon != null || ghostSuspF != null || ghostSuspR != null
  const gp = hasGhost ? computeSidePhysics({
    gLon: ghostGLon ?? 0,
    gVert: ghostGVert,
    suspF: ghostSuspF,
    suspR: ghostSuspR,
    rideHeightF: ghostRideHeightF,
    rideHeightR: ghostRideHeightR,
  }) : null

  // ── Layout ─────────────────────────────────────────────────────────────
  const W = 220, H = 130, cx = W / 2
  const GY = 112
  const TW = 18, TH = 26
  const WB_PX = 120
  const fWheelX = cx - WB_PX / 2
  const rWheelX = cx + WB_PX / 2
  const sFx = cx - WB_PX / 2 + 8, sRx = cx + WB_PX / 2 - 8, sSy = BY + 18

  // Mirror for left side: flip the whole SVG horizontally
  const mirror = side === 'L'

  return (
    <div style={{
      background: 'rgba(8,12,22,0.85)', backdropFilter: 'blur(6px)',
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
      padding: '6px 6px 4px', textAlign: 'center', userSelect: 'none',
      width: '100%', boxSizing: 'border-box', position: 'relative',
    }}>
      <BetaBadge />
      <p style={{ color: '#6b7280', fontSize: 9, letterSpacing: '0.12em',
        textTransform: 'uppercase', margin: 0, marginBottom: 2 }}>
        {side === 'R' ? 'RIGHT SUSP' : 'LEFT SUSP'}
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%"
        style={{ display: 'block', transform: mirror ? 'scaleX(-1)' : undefined }}>
        <defs>
          <linearGradient id={`st${side}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#18182b" />
            <stop offset="50%" stopColor="#2a2a42" />
            <stop offset="100%" stopColor="#18182b" />
          </linearGradient>
          <marker id={`aP${side}`} markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto">
            <polygon points="0 0,5 2,0 4" fill={gc} /></marker>
          <marker id={`aV${side}`} markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto">
            <polygon points="0 0,5 2,0 4" fill="#a78bfa" /></marker>
        </defs>

        {/* Ground line */}
        <line x1={15} y1={GY} x2={W - 15} y2={GY}
          stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />

        {/* ── Ghost overlay ──────────────────────────── */}
        {gp && (
          <g opacity={0.28}>
            <rect x={fWheelX - TW / 2} y={gp.hFy - TH / 2} width={TW} height={TH} rx={4}
              fill="none" stroke="#facc15" strokeWidth={1} />
            <rect x={rWheelX - TW / 2} y={gp.hRy - TH / 2} width={TW} height={TH} rx={4}
              fill="none" stroke="#facc15" strokeWidth={1} />
            <g transform={`rotate(${gp.pitchDeg},${cx},${gp.BY})`}>
              <path d={`
                M${fWheelX - 16},${gp.BY + 18}
                C${fWheelX - 16},${gp.BY + 2} ${fWheelX + 16},${gp.BY + 2} ${fWheelX + 16},${gp.BY + 18}
                L${fWheelX + 16},${gp.BY - 14}
                L${rWheelX - 16},${gp.BY - 14}
                L${rWheelX - 16},${gp.BY + 18} Z
              `} fill="none" stroke="#facc15" strokeWidth={0.9} />
            </g>
          </g>
        )}

        {/* ── Front tyre ─────────────────────────────── */}
        <rect x={fWheelX - TW / 2} y={hFy - TH / 2} width={TW} height={TH} rx={4}
          fill={`url(#st${side})`}
          stroke={liftF ? '#f87171' : 'rgba(255,255,255,0.12)'}
          strokeWidth={liftF ? 1.4 : 0.7} />
        <ellipse cx={fWheelX} cy={hFy} rx={5} ry={5}
          fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={0.6} />
        <circle cx={fWheelX} cy={hFy} r={1.6} fill="rgba(255,255,255,0.1)" />

        {/* ── Rear tyre ──────────────────────────────── */}
        <rect x={rWheelX - TW / 2} y={hRy - TH / 2} width={TW} height={TH} rx={4}
          fill={`url(#st${side})`}
          stroke={liftR ? '#f87171' : 'rgba(255,255,255,0.12)'}
          strokeWidth={liftR ? 1.4 : 0.7} />
        <ellipse cx={rWheelX} cy={hRy} rx={5} ry={5}
          fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={0.6} />
        <circle cx={rWheelX} cy={hRy} r={1.6} fill="rgba(255,255,255,0.1)" />

        {/* ── Suspension coil springs ─────────────────── */}
        {/* Front */}
        <line x1={fWheelX} y1={hFy - TH / 2 + 2} x2={rsFx} y2={rsFy}
          stroke={cF} strokeWidth={2.5} strokeLinecap="round" opacity={0.1} />
        <path d={coil(fWheelX, hFy - TH / 2 + 2, rsFx, rsFy)}
          fill="none" stroke={cF} strokeWidth={1} opacity={0.65} />
        {/* Rear */}
        <line x1={rWheelX} y1={hRy - TH / 2 + 2} x2={rsRx} y2={rsRy}
          stroke={cR} strokeWidth={2.5} strokeLinecap="round" opacity={0.1} />
        <path d={coil(rWheelX, hRy - TH / 2 + 2, rsRx, rsRy)}
          fill="none" stroke={cR} strokeWidth={1} opacity={0.65} />

        {/* ── Body (pitches + heaves) ─────────────────── */}
        <g transform={`rotate(${pitchDeg},${cx},${BY})`}>

          {/* Wheel arches — smooth semicircles */}
          <path d={`
            M${fWheelX - 16},${BY + 18}
            C${fWheelX - 16},${BY + 2} ${fWheelX + 16},${BY + 2} ${fWheelX + 16},${BY + 18}
          `} fill={`${gc}08`} stroke={gc} strokeWidth={0.8} />
          <path d={`
            M${rWheelX - 16},${BY + 18}
            C${rWheelX - 16},${BY + 2} ${rWheelX + 16},${BY + 2} ${rWheelX + 16},${BY + 18}
          `} fill={`${gc}08`} stroke={gc} strokeWidth={0.8} />

          {/* Main body — GT3 RS side: flat hood, windshield starts past front wheel */}
          <path d={`
            M${fWheelX - 18},${BY + 18}
            C${fWheelX - 30},${BY + 16} ${fWheelX - 32},${BY + 4} ${fWheelX - 28},${BY - 1}
            C${fWheelX - 24},${BY - 6} ${fWheelX - 16},${BY - 8} ${fWheelX - 8},${BY - 8}
            L${fWheelX + 16},${BY - 8}
            C${fWheelX + 24},${BY - 10} ${fWheelX + 34},${BY - 18} ${cx - 4},${BY - 26}
            C${cx + 6},${BY - 30} ${cx + 16},${BY - 28} ${rWheelX - 16},${BY - 20}
            C${rWheelX - 8},${BY - 16} ${rWheelX},${BY - 12} ${rWheelX + 8},${BY - 6}
            C${rWheelX + 14},${BY} ${rWheelX + 18},${BY + 8} ${rWheelX + 18},${BY + 18}
          `} fill={`${gc}0a`} stroke={gc} strokeWidth={0.9} />

          {/* Sill line (lower body edge) */}
          <path d={`
            M${fWheelX + 16},${BY + 18}
            C${cx - 20},${BY + 16} ${cx + 20},${BY + 16} ${rWheelX - 16},${BY + 18}
          `} fill="none" stroke={gc} strokeWidth={0.5} opacity={0.2} />

          {/* Hood highlight */}
          <path d={`
            M${fWheelX - 12},${BY - 8}
            L${fWheelX + 14},${BY - 8}
          `} fill="none" stroke={gc} strokeWidth={0.4} opacity={0.15} />

          {/* Roofline highlight */}
          <path d={`
            M${cx - 4},${BY - 26}
            C${cx + 6},${BY - 30} ${cx + 16},${BY - 28} ${rWheelX - 16},${BY - 20}
          `} fill="none" stroke={gc} strokeWidth={0.5} opacity={0.25} />

          {/* Windshield — starts at end of flat hood */}
          <path d={`
            M${fWheelX + 16},${BY - 8}
            C${fWheelX + 24},${BY - 10} ${fWheelX + 34},${BY - 18} ${cx - 4},${BY - 26}
            L${cx - 6},${BY - 14}
            C${cx - 14},${BY - 10} ${fWheelX + 20},${BY - 4} ${fWheelX + 20},${BY - 2}
            Z
          `} fill="#0c1020" stroke={gc} strokeWidth={0.5} opacity={0.45} />

          {/* Side window — curved DLO */}
          <path d={`
            M${cx - 6},${BY - 26}
            C${cx + 4},${BY - 29} ${cx + 12},${BY - 27} ${rWheelX - 18},${BY - 20}
            L${rWheelX - 14},${BY - 14}
            C${cx + 6},${BY - 16} ${cx - 2},${BY - 14} ${cx - 6},${BY - 14}
            Z
          `} fill="#0a0e1a" stroke={gc} strokeWidth={0.45} opacity={0.5} />

          {/* Rear quarter window */}
          <path d={`
            M${rWheelX - 18},${BY - 20}
            C${rWheelX - 14},${BY - 18} ${rWheelX - 10},${BY - 16} ${rWheelX - 8},${BY - 14}
            L${rWheelX - 14},${BY - 14}
            Z
          `} fill="#0c1020" stroke={gc} strokeWidth={0.4} opacity={0.35} />

          {/* B-pillar */}
          <line x1={cx - 2} y1={BY - 27} x2={cx - 2} y2={BY - 14}
            stroke={gc} strokeWidth={0.6} opacity={0.2} />

          {/* Door crease line */}
          <path d={`
            M${fWheelX + 20},${BY}
            C${cx - 10},${BY - 2} ${cx + 8},${BY - 4} ${rWheelX - 16},${BY}
          `} fill="none" stroke={gc} strokeWidth={0.35} opacity={0.15} />

          {/* Side air intake (behind front wheel) */}
          <path d={`
            M${fWheelX + 16},${BY + 6}
            C${fWheelX + 18},${BY + 4} ${fWheelX + 24},${BY + 4} ${fWheelX + 26},${BY + 6}
            L${fWheelX + 26},${BY + 10}
            C${fWheelX + 24},${BY + 11} ${fWheelX + 18},${BY + 11} ${fWheelX + 16},${BY + 10}
            Z
          `} fill={`${gc}10`} stroke={gc} strokeWidth={0.4} opacity={0.4} />

          {/* Rear engine intake louvers */}
          {[0, 3.5, 7].map(dy => (
            <path key={dy} d={`
              M${rWheelX - 22},${BY - 10 + dy}
              C${rWheelX - 18},${BY - 10.5 + dy} ${rWheelX - 12},${BY - 10.5 + dy} ${rWheelX - 8},${BY - 10 + dy}
            `} fill="none" stroke={gc} strokeWidth={0.4} opacity={0.2} />
          ))}

          {/* Front bumper / splitter — low smooth lip */}
          <path d={`
            M${fWheelX - 20},${BY + 18}
            C${fWheelX - 24},${BY + 18} ${fWheelX - 26},${BY + 19} ${fWheelX - 28},${BY + 18}
          `} fill="none" stroke={gc} strokeWidth={1.2} opacity={0.35} />

          {/* Front headlight — slim, sits on flat hood line */}
          <path d={`
            M${fWheelX - 16},${BY - 6}
            C${fWheelX - 14},${BY - 8} ${fWheelX - 10},${BY - 8} ${fWheelX - 8},${BY - 6}
            C${fWheelX - 10},${BY - 4} ${fWheelX - 14},${BY - 4} ${fWheelX - 16},${BY - 6}
            Z
          `} fill={`${gc}20`} stroke={gc} strokeWidth={0.5} />

          {/* Tail light — slim 992-style */}
          <path d={`
            M${rWheelX + 12},${BY - 4}
            C${rWheelX + 14},${BY - 6} ${rWheelX + 16},${BY - 5} ${rWheelX + 16},${BY - 3}
            L${rWheelX + 16},${BY + 2}
            C${rWheelX + 16},${BY + 4} ${rWheelX + 14},${BY + 4} ${rWheelX + 12},${BY + 2}
            Z
          `} fill="rgba(255,30,30,0.45)" stroke="rgba(255,60,60,0.4)" strokeWidth={0.4} />

          {/* Rear bumper / diffuser */}
          <path d={`
            M${rWheelX + 18},${BY + 18}
            C${rWheelX + 20},${BY + 18} ${rWheelX + 22},${BY + 19} ${rWheelX + 22},${BY + 18}
          `} fill="none" stroke={gc} strokeWidth={0.8} opacity={0.3} />
          {[0, 3].map(dy => (
            <line key={dy} x1={rWheelX + 18} y1={BY + 14 + dy} x2={rWheelX + 22} y2={BY + 14 + dy}
              stroke={gc} strokeWidth={0.3} opacity={0.15} />
          ))}

          {/* Exhaust tip */}
          <ellipse cx={rWheelX + 20} cy={BY + 12} rx={2} ry={1.5}
            fill="#0e0e18" stroke="rgba(255,255,255,0.1)" strokeWidth={0.4} />

          {/* Rear wing — swan-neck side profile */}
          <path d={`
            M${rWheelX - 4},${BY - 20}
            C${rWheelX - 2},${BY - 24} ${rWheelX},${BY - 28} ${rWheelX + 2},${BY - 30}
          `} fill="none" stroke={gc} strokeWidth={1.1} opacity={0.4} />
          <path d={`
            M${rWheelX - 12},${BY - 32}
            C${rWheelX - 4},${BY - 35} ${rWheelX + 10},${BY - 35} ${rWheelX + 16},${BY - 32}
            C${rWheelX + 14},${BY - 30} ${rWheelX - 2},${BY - 29} ${rWheelX - 10},${BY - 30}
            Z
          `} fill={`${gc}12`} stroke={gc} strokeWidth={0.7} />

          {/* Strut attachment dots */}
          <circle cx={sFx} cy={sSy} r={1.5} fill={cF} opacity={0.6} />
          <circle cx={sRx} cy={sSy} r={1.5} fill={cR} opacity={0.6} />
        </g>

        {/* ── G arrow (longitudinal) ─────────────────── */}
        {absG > 0.08 && (() => {
          const len = Math.min(20, absG * 14), dir = gLon > 0 ? -1 : 1
          return <line x1={cx} y1={BY - 2} x2={cx + dir * len} y2={BY - 2}
            stroke={gc} strokeWidth={1.2} markerEnd={`url(#aP${side})`} opacity={0.5} />
        })()}
        {/* Vert G arrow */}
        {gVert != null && Math.abs(gVert) > 0.15 && (() => {
          const len = Math.min(10, Math.abs(gVert) * 8), dir = gVert > 0 ? 1 : -1
          return <line x1={cx + 40} y1={BY - 30} x2={cx + 40} y2={BY - 30 + dir * len}
            stroke="#a78bfa" strokeWidth={1} markerEnd={`url(#aV${side})`} opacity={0.4} />
        })()}

        {/* ── Suspension travel bars ─────────────────── */}
        {/* Front */}
        <rect x={7} y={BY} width={4} height={24} rx={2}
          fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth={0.4} />
        <rect x={7} y={BY + (1 - sf) * 24} width={4} height={sf * 24} rx={2}
          fill={cF} opacity={0.6} />
        {/* Rear */}
        <rect x={W - 11} y={BY} width={4} height={24} rx={2}
          fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth={0.4} />
        <rect x={W - 11} y={BY + (1 - sr) * 24} width={4} height={sr * 24} rx={2}
          fill={cR} opacity={0.6} />

        {/* mm labels — need to counter-mirror text for left view */}
        <g style={{ transform: mirror ? 'scaleX(-1)' : undefined,
          transformOrigin: `${W / 2}px ${H / 2}px` }}>
          <text x={9} y={BY + 32} textAnchor="middle" fill={cF}
            fontSize={6} fontFamily="monospace">{sfMm}</text>
          <text x={9} y={BY + 38} textAnchor="middle" fill="rgba(255,255,255,0.18)"
            fontSize={4}>mm</text>
          <text x={W - 9} y={BY + 32} textAnchor="middle" fill={cR}
            fontSize={6} fontFamily="monospace">{srMm}</text>
          <text x={W - 9} y={BY + 38} textAnchor="middle" fill="rgba(255,255,255,0.18)"
            fontSize={4}>mm</text>

          {/* Corner labels */}
          <text x={fWheelX} y={GY + 9} textAnchor="middle"
            fill="rgba(255,255,255,0.16)" fontSize={5}>
            {side === 'R' ? 'FR' : 'FL'}
          </text>
          <text x={rWheelX} y={GY + 9} textAnchor="middle"
            fill="rgba(255,255,255,0.16)" fontSize={5}>
            {side === 'R' ? 'RR' : 'RL'}
          </text>

          {/* Ride height readouts (only if data available) */}
          {(rideHeightF != null || rideHeightR != null) && <>
            <text x={fWheelX} y={GY + 16} textAnchor="middle"
              fill={liftF ? '#f87171' : '#555'} fontSize={4.5} fontFamily="monospace">
              {Math.round(rhF * 1000)}mm
            </text>
            <text x={rWheelX} y={GY + 16} textAnchor="middle"
              fill={liftR ? '#f87171' : '#555'} fontSize={4.5} fontFamily="monospace">
              {Math.round(rhR * 1000)}mm
            </text>
          </>}

          {/* Lift warnings */}
          {liftF && <text x={fWheelX} y={hFy + TH / 2 + 10} textAnchor="middle"
            fill="#f87171" fontSize={5} fontFamily="monospace">LIFT</text>}
          {liftR && <text x={rWheelX} y={hRy + TH / 2 + 10} textAnchor="middle"
            fill="#f87171" fontSize={5} fontFamily="monospace">LIFT</text>}
        </g>
      </svg>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 1, padding: '0 2px' }}>
        <span style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 10 }}>{pitchLbl}</span>
        <span style={{ color: gc, fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{gLbl}</span>
        {gVert != null && (
          <span style={{ color: '#a78bfa', fontFamily: 'monospace', fontSize: 10 }}>
            {gVert >= 0 ? '+' : ''}{gVert.toFixed(1)}g↕
          </span>
        )}
      </div>
    </div>
  )
}
