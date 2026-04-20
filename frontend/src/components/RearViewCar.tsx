import { computeRearPhysics, coilPath } from './carPhysics'
import BetaBadge from './BetaBadge'

export default function RearViewCar({
  gLat = 0,
  gVert,
  suspRL,
  suspRR,
  rideHeightRL,
  rideHeightRR,
  rear3rdDefl,
  ghostGLat,
  ghostSuspRL,
  ghostSuspRR,
  ghostRideHeightRL,
  ghostRideHeightRR,
  ghostRear3rdDefl,
  ghostGVert,
}: {
  gLat: number
  gVert?: number | null
  suspRL?: number | null
  suspRR?: number | null
  rideHeightRL?: number | null
  rideHeightRR?: number | null
  rear3rdDefl?: number | null
  ghostGLat?: number | null
  ghostSuspRL?: number | null
  ghostSuspRR?: number | null
  ghostRideHeightRL?: number | null
  ghostRideHeightRR?: number | null
  ghostRear3rdDefl?: number | null
  ghostGVert?: number | null
}) {
  // ── Physics (see carPhysics.ts) ────────────────────────────────────────
  const p = computeRearPhysics({ gLat, gVert, suspRL, suspRR, rideHeightRL, rideHeightRR, rear3rdDefl })
  const {
    rl, rr, hasRH, rhRL, rhRR,
    rollDeg, gc, cL, cR, cH,
    hLy, hRy, liftL, liftR,
    BY, camL, camR,
    rlMm, rrMm, r3dMm, rollLbl, gLbl,
    rsLx, rsLy, rsRx, rsRy,
  } = p
  const absG = Math.abs(gLat)
  const coil = coilPath

  // ── Ghost physics ──────────────────────────────────────────────────────
  const hasGhost = ghostGLat != null || ghostSuspRL != null || ghostSuspRR != null
  const gp = hasGhost ? computeRearPhysics({
    gLat: ghostGLat ?? 0,
    gVert: ghostGVert,
    suspRL: ghostSuspRL,
    suspRR: ghostSuspRR,
    rideHeightRL: ghostRideHeightRL,
    rideHeightRR: ghostRideHeightRR,
    rear3rdDefl: ghostRear3rdDefl,
  }) : null

  // ── Layout ─────────────────────────────────────────────────────────────
  const W = 220, H = 160, cx = W / 2
  const GY = 140
  const TW = 20, TH = 30, TR = 64
  const hLx = cx - TR, hRx = cx + TR
  const sLx = cx - 50, sRx = cx + 50, sY = BY + 22

  return (
    <div style={{
      background: 'rgba(8,12,22,0.85)', backdropFilter: 'blur(6px)',
      borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
      padding: '6px 6px 4px', textAlign: 'center', userSelect: 'none',
      width: '100%', boxSizing: 'border-box', position: 'relative',
    }}>
      <BetaBadge />
      <p style={{ color: '#6b7280', fontSize: 9, letterSpacing: '0.12em',
        textTransform: 'uppercase', margin: 0, marginBottom: 2 }}>REAR SUSP</p>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="rT" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#18182b" />
            <stop offset="35%" stopColor="#2a2a42" />
            <stop offset="65%" stopColor="#2a2a42" />
            <stop offset="100%" stopColor="#18182b" />
          </linearGradient>
          <marker id="aG" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto">
            <polygon points="0 0,5 2,0 4" fill={gc} /></marker>
          <marker id="aV" markerWidth="5" markerHeight="4" refX="4" refY="2" orient="auto">
            <polygon points="0 0,5 2,0 4" fill="#a78bfa" /></marker>
        </defs>

        {/* ── Ground ───────────────────────────────────── */}
        <line x1={20} y1={GY} x2={W - 20} y2={GY}
          stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />

        {/* ── Ghost car overlay ────────────────────────── */}
        {gp && (() => {
          const ghLx = cx - TR, ghRx = cx + TR
          return (
            <g opacity={0.28}>
              {/* Ghost tyres */}
              <g transform={`rotate(${gp.camL},${ghLx},${gp.hLy})`}>
                <rect x={ghLx - TW / 2} y={gp.hLy - TH / 2} width={TW} height={TH} rx={4.5}
                  fill="none" stroke="#facc15" strokeWidth={1} />
              </g>
              <g transform={`rotate(${gp.camR},${ghRx},${gp.hRy})`}>
                <rect x={ghRx - TW / 2} y={gp.hRy - TH / 2} width={TW} height={TH} rx={4.5}
                  fill="none" stroke="#facc15" strokeWidth={1} />
              </g>
              {/* Ghost body */}
              <g transform={`rotate(${gp.rollDeg},${cx},${gp.BY})`}>
                <path d={`
                  M${cx - 36},${gp.BY + 24} L${cx - 36},${gp.BY - 4}
                  Q${cx - 34},${gp.BY - 18} ${cx - 22},${gp.BY - 22}
                  L${cx + 22},${gp.BY - 22}
                  Q${cx + 34},${gp.BY - 18} ${cx + 36},${gp.BY - 4}
                  L${cx + 36},${gp.BY + 24} Z
                `} fill="none" stroke="#facc15" strokeWidth={0.9} />
                <path d={`M${cx - 80},${gp.BY + 28} Q${cx - 80},${gp.BY + 2} ${cx - 58},${gp.BY + 2} L${cx - 40},${gp.BY + 2} Q${cx - 36},${gp.BY + 2} ${cx - 36},${gp.BY + 10} L${cx - 36},${gp.BY + 28}`}
                  fill="none" stroke="#facc15" strokeWidth={0.7} />
                <path d={`M${cx + 80},${gp.BY + 28} Q${cx + 80},${gp.BY + 2} ${cx + 58},${gp.BY + 2} L${cx + 40},${gp.BY + 2} Q${cx + 36},${gp.BY + 2} ${cx + 36},${gp.BY + 10} L${cx + 36},${gp.BY + 28}`}
                  fill="none" stroke="#facc15" strokeWidth={0.7} />
              </g>
            </g>
          )
        })()}

        {/* ── Left tyre ────────────────────────────────── */}
        <g transform={`rotate(${camL},${hLx},${hLy})`}>
          <rect x={hLx - TW / 2} y={hLy - TH / 2} width={TW} height={TH} rx={4.5}
            fill="url(#rT)" stroke={liftL ? '#f87171' : 'rgba(255,255,255,0.12)'}
            strokeWidth={liftL ? 1.4 : 0.7} />
          <ellipse cx={hLx} cy={hLy} rx={5.5} ry={5.5}
            fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={0.7} />
          <circle cx={hLx} cy={hLy} r={1.8} fill="rgba(255,255,255,0.1)" />
        </g>

        {/* ── Right tyre ───────────────────────────────── */}
        <g transform={`rotate(${camR},${hRx},${hRy})`}>
          <rect x={hRx - TW / 2} y={hRy - TH / 2} width={TW} height={TH} rx={4.5}
            fill="url(#rT)" stroke={liftR ? '#f87171' : 'rgba(255,255,255,0.12)'}
            strokeWidth={liftR ? 1.4 : 0.7} />
          <ellipse cx={hRx} cy={hRy} rx={5.5} ry={5.5}
            fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={0.7} />
          <circle cx={hRx} cy={hRy} r={1.8} fill="rgba(255,255,255,0.1)" />
        </g>

        {/* ── Suspension struts (behind body) ──────────── */}
        <line x1={hLx + 3} y1={hLy - TH / 2 + 2} x2={rsLx} y2={rsLy}
          stroke={cL} strokeWidth={3} strokeLinecap="round" opacity={0.12} />
        <path d={coil(hLx + 3, hLy - TH / 2 + 2, rsLx, rsLy)}
          fill="none" stroke={cL} strokeWidth={1.1} opacity={0.7} />
        <line x1={hRx - 3} y1={hRy - TH / 2 + 2} x2={rsRx} y2={rsRy}
          stroke={cR} strokeWidth={3} strokeLinecap="round" opacity={0.12} />
        <path d={coil(hRx - 3, hRy - TH / 2 + 2, rsRx, rsRy)}
          fill="none" stroke={cR} strokeWidth={1.1} opacity={0.7} />

        {/* ── 3rd spring (heave) ───────────────────────── */}
        {rear3rdDefl != null && (() => {
          const top = BY + 26, bot = Math.min(hLy, hRy) - TH / 2 + 1
          return <>
            <path d={coil(cx, top, cx, bot, 5, 2)} fill="none" stroke={cH} strokeWidth={1} opacity={0.45} />
            <circle cx={cx} cy={top} r={1.3} fill={cH} opacity={0.4} />
            <circle cx={cx} cy={bot} r={1.3} fill={cH} opacity={0.4} />
          </>
        })()}

        {/* ── Body (rolls + heaves) ────────────────────── */}
        <g transform={`rotate(${rollDeg},${cx},${BY})`}>

          {/* ── Fender arches over wheels ──────────────── */}
          <path d={`
            M${cx - 80},${BY + 28}
            Q${cx - 80},${BY + 2} ${cx - 58},${BY + 2}
            L${cx - 40},${BY + 2}
            Q${cx - 36},${BY + 2} ${cx - 36},${BY + 10}
            L${cx - 36},${BY + 28}
          `} fill={`${gc}08`} stroke={gc} strokeWidth={0.9} />
          <path d={`
            M${cx + 80},${BY + 28}
            Q${cx + 80},${BY + 2} ${cx + 58},${BY + 2}
            L${cx + 40},${BY + 2}
            Q${cx + 36},${BY + 2} ${cx + 36},${BY + 10}
            L${cx + 36},${BY + 28}
          `} fill={`${gc}08`} stroke={gc} strokeWidth={0.9} />

          {/* ── Central rear panel ─────────────────────── */}
          <path d={`
            M${cx - 36},${BY + 24}
            L${cx - 36},${BY - 4}
            Q${cx - 34},${BY - 18} ${cx - 22},${BY - 22}
            L${cx + 22},${BY - 22}
            Q${cx + 34},${BY - 18} ${cx + 36},${BY - 4}
            L${cx + 36},${BY + 24}
            Z
          `} fill={`${gc}0a`} stroke={gc} strokeWidth={0.9} />

          {/* ── Roofline ───────────────────────────────── */}
          <path d={`M${cx - 22},${BY - 22} Q${cx},${BY - 30} ${cx + 22},${BY - 22}`}
            fill="none" stroke={gc} strokeWidth={0.7} opacity={0.4} />

          {/* ── Full-width tail light bar (992 style) ──── */}
          {/* Runs across the full width including fenders */}
          <line x1={cx - 76} y1={BY + 8} x2={cx - 36} y2={BY + 8}
            stroke="rgba(255,50,50,0.5)" strokeWidth={3} strokeLinecap="round" />
          <line x1={cx + 36} y1={BY + 8} x2={cx + 76} y2={BY + 8}
            stroke="rgba(255,50,50,0.5)" strokeWidth={3} strokeLinecap="round" />
          <rect x={cx - 32} y={BY - 8} width={64} height={4} rx={2}
            fill="rgba(200,20,20,0.55)" stroke="rgba(255,60,60,0.4)" strokeWidth={0.4} />
          {/* LED segments in centre bar */}
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={cx - 30 + i * 7.5} y={BY - 7.5} width={5} height={3} rx={0.8}
              fill="rgba(255,40,40,0.8)" />
          ))}

          <rect x={cx - 20} y={BY + 14} width={40} height={8} rx={1.5}
            fill="rgba(0,0,0,0.25)" stroke="rgba(255,255,255,0.05)" strokeWidth={0.3} />
          <text x={cx} y={BY + 20} textAnchor="middle" fill={gc}
            fontSize={4.5} fontFamily="monospace" opacity={0.3} letterSpacing="1.5"></text>

          {/* ── Exhaust tips (centre twin) ──────────────── */}
          <ellipse cx={cx - 9} cy={BY + 28} rx={4.5} ry={3}
            fill="#0e0e18" stroke="rgba(255,255,255,0.12)" strokeWidth={0.6} />
          <ellipse cx={cx + 9} cy={BY + 28} rx={4.5} ry={3}
            fill="#0e0e18" stroke="rgba(255,255,255,0.12)" strokeWidth={0.6} />
          <ellipse cx={cx - 9} cy={BY + 28} rx={2.5} ry={1.5} fill="rgba(50,50,50,0.4)" />
          <ellipse cx={cx + 9} cy={BY + 28} rx={2.5} ry={1.5} fill="rgba(50,50,50,0.4)" />

          {/* ── Diffuser fins ──────────────────────────── */}
          <line x1={cx - 32} y1={BY + 28} x2={cx + 32} y2={BY + 28}
            stroke={gc} strokeWidth={0.5} opacity={0.2} />
          {[-22, -11, 0, 11, 22].map((dx, i) => (
            <line key={i} x1={cx + dx} y1={BY + 24} x2={cx + dx} y2={BY + 28}
              stroke={gc} strokeWidth={0.4} opacity={0.2} />
          ))}

          {/* ── Rear wing ──────────────────────────────── */}
          {/* Swan-neck mounts */}
          <line x1={cx - 18} y1={BY - 22} x2={cx - 22} y2={BY - 40}
            stroke={gc} strokeWidth={1.4} opacity={0.45} />
          <line x1={cx + 18} y1={BY - 22} x2={cx + 22} y2={BY - 40}
            stroke={gc} strokeWidth={1.4} opacity={0.45} />
          {/* Endplates */}
          <rect x={cx - 58} y={BY - 50} width={3.5} height={16} rx={1.2}
            fill={`${gc}18`} stroke={gc} strokeWidth={0.6} />
          <rect x={cx + 54.5} y={BY - 50} width={3.5} height={16} rx={1.2}
            fill={`${gc}18`} stroke={gc} strokeWidth={0.6} />
          {/* Main plane — aerofoil shape */}
          <path d={`
            M${cx - 58},${BY - 46}
            Q${cx},${BY - 50} ${cx + 58},${BY - 46}
            L${cx + 56},${BY - 40}
            Q${cx},${BY - 44} ${cx - 56},${BY - 40}
            Z
          `} fill={`${gc}10`} stroke={gc} strokeWidth={0.8} />
          {/* Gurney flap */}
          <path d={`M${cx - 56},${BY - 46} Q${cx},${BY - 49.5} ${cx + 56},${BY - 46}`}
            fill="none" stroke={gc} strokeWidth={0.5} opacity={0.5} />

          {/* Strut attachment dots */}
          <circle cx={sLx} cy={sY} r={1.8} fill={cL} opacity={0.7} />
          <circle cx={sRx} cy={sY} r={1.8} fill={cR} opacity={0.7} />
        </g>

        {/* ── G arrows ─────────────────────────────────── */}
        {absG > 0.1 && (() => {
          const len = Math.min(26, absG * 10), dir = gLat > 0 ? 1 : -1
          return <line x1={cx} y1={BY - 4} x2={cx + dir * len} y2={BY - 4}
            stroke={gc} strokeWidth={1.4} markerEnd="url(#aG)" opacity={0.55} />
        })()}
        {gVert != null && Math.abs(gVert) > 0.15 && (() => {
          const len = Math.min(12, Math.abs(gVert) * 9), dir = gVert > 0 ? 1 : -1
          return <line x1={cx + 32} y1={BY - 40} x2={cx + 32} y2={BY - 40 + dir * len}
            stroke="#a78bfa" strokeWidth={1.1} markerEnd="url(#aV)" opacity={0.45} />
        })()}

        {/* ── Suspension travel bars ───────────────────── */}
        {/* Left */}
        <rect x={7} y={BY + 2} width={4} height={28} rx={2}
          fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth={0.4} />
        <rect x={7} y={BY + 2 + (1 - rl) * 28} width={4} height={rl * 28} rx={2}
          fill={cL} opacity={0.65} />
        <text x={9} y={BY + 38} textAnchor="middle" fill={cL}
          fontSize={6.5} fontFamily="monospace">{rlMm}</text>
        <text x={9} y={BY + 44} textAnchor="middle" fill="rgba(255,255,255,0.18)"
          fontSize={4.5}>mm</text>
        {/* Right */}
        <rect x={W - 11} y={BY + 2} width={4} height={28} rx={2}
          fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.07)" strokeWidth={0.4} />
        <rect x={W - 11} y={BY + 2 + (1 - rr) * 28} width={4} height={rr * 28} rx={2}
          fill={cR} opacity={0.65} />
        <text x={W - 9} y={BY + 38} textAnchor="middle" fill={cR}
          fontSize={6.5} fontFamily="monospace">{rrMm}</text>
        <text x={W - 9} y={BY + 44} textAnchor="middle" fill="rgba(255,255,255,0.18)"
          fontSize={4.5}>mm</text>

        {/* Corner labels */}
        <text x={hLx} y={GY + 10} textAnchor="middle"
          fill="rgba(255,255,255,0.16)" fontSize={5.5}>RL</text>
        <text x={hRx} y={GY + 10} textAnchor="middle"
          fill="rgba(255,255,255,0.16)" fontSize={5.5}>RR</text>

        {/* Ride height readouts */}
        {hasRH && <>
          <text x={hLx} y={GY + 17} textAnchor="middle"
            fill={liftL ? '#f87171' : '#555'} fontSize={5} fontFamily="monospace">
            {Math.round(rhRL * 1000)}mm
          </text>
          <text x={hRx} y={GY + 17} textAnchor="middle"
            fill={liftR ? '#f87171' : '#555'} fontSize={5} fontFamily="monospace">
            {Math.round(rhRR * 1000)}mm
          </text>
        </>}

        {/* 3rd spring */}
        {rear3rdDefl != null && (
          <text x={cx} y={GY + 10} textAnchor="middle"
            fill={cH} fontSize={5.5} fontFamily="monospace">3rd {r3dMm}</text>
        )}

        {/* Lift warnings */}
        {liftL && <text x={hLx} y={hLy + TH / 2 + 10} textAnchor="middle"
          fill="#f87171" fontSize={5.5} fontFamily="monospace">LIFT</text>}
        {liftR && <text x={hRx} y={hRy + TH / 2 + 10} textAnchor="middle"
          fill="#f87171" fontSize={5.5} fontFamily="monospace">LIFT</text>}
      </svg>

      {/* Footer readouts */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 1, padding: '0 2px' }}>
        <span style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: 10 }}>{rollLbl}</span>
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
