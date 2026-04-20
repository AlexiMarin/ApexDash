import { useMemo, useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { useT } from '../contexts/LanguageContext'

interface LayoutData {
  lap_dist: number[]
  lap_time_ms: number | null
  sector_dists?: number[]
  channels: {
    lat: number[]
    lon: number[]
    path_lateral: number[]
    track_edge: number[]
    speed_kmh?: number[]
    throttle?: number[]
    brake?: number[]
  }
}

interface GhostData {
  lap_dist: number[]
  lap_time_ms: number | null
  channels: {
    lat: number[]
    lon: number[]
    throttle?: number[]
    brake?: number[]
  }
}

interface Props {
  data: LayoutData
  ghostData?: GhostData | null
  width?: number
  height?: number
  onProgress?: (p: number) => void
  onPlayingChange?: (playing: boolean) => void
  isFullscreen?: boolean
  onExitFullscreen?: () => void
}

export interface TrackMapHandle {
  seek: (p: number) => void
  togglePlay: () => void
  stepFrame: (dir: 1 | -1) => void
}

// ── Geometry helpers ─────────────────────────────────────────

const M_PER_DEG_LAT = 111_320
const M_PER_DEG_LON = 55_660   // at ~60°N: 111320 * cos(60°)

function gradient(arr: number[]): number[] {
  const n = arr.length
  const g = new Array(n)
  g[0] = arr[1] - arr[0]
  g[n - 1] = arr[n - 1] - arr[n - 2]
  for (let i = 1; i < n - 1; i++) g[i] = (arr[i + 1] - arr[i - 1]) / 2
  return g
}

function percentile95(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * 0.95)]
}

function toSvg(
  lons: number[], lats: number[],
  padding: number, width: number, height: number
): [number[], number[]] {
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const rangeLon = maxLon - minLon || 1
  const rangeLat = maxLat - minLat || 1
  const usableW = width - 2 * padding
  const usableH = height - 2 * padding

  // Keep aspect ratio
  const scaleLon = usableW / rangeLon
  const scaleLat = usableH / rangeLat
  const scale = Math.min(scaleLon, scaleLat)

  const offX = padding + (usableW - rangeLon * scale) / 2
  const offY = padding + (usableH - rangeLat * scale) / 2

  const xs = lons.map(v => offX + (v - minLon) * scale)
  const ys = lats.map(v => offY + (maxLat - v) * scale)  // flip Y
  return [xs, ys]
}

function polyPoints(xs: number[], ys: number[]): string {
  return xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
}

function polylineCumDist(xs: number[], ys: number[]): number[] {
  const d = new Array(xs.length)
  d[0] = 0
  for (let i = 1; i < xs.length; i++) {
    const dx = xs[i] - xs[i - 1]
    const dy = ys[i] - ys[i - 1]
    d[i] = d[i - 1] + Math.sqrt(dx * dx + dy * dy)
  }
  return d
}

function interpolateArc(xs: number[], ys: number[], cumDist: number[], targetDist: number): [number, number] {
  let lo = 0, hi = xs.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (cumDist[mid] <= targetDist) lo = mid
    else hi = mid
  }
  const span = cumDist[hi] - cumDist[lo] || 1
  const f = (targetDist - cumDist[lo]) / span
  return [xs[lo] + f * (xs[hi] - xs[lo]), ys[lo] + f * (ys[hi] - ys[lo])]
}

function fmtMs(ms: number) {
  const m = Math.floor(ms / 60000)
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}

// ── Component ────────────────────────────────────────────────

const TrackMap = forwardRef<TrackMapHandle, Props>(function TrackMap({ data, ghostData, width = 600, height = 500, onProgress, onPlayingChange, isFullscreen, onExitFullscreen }, ref) {
  const t = useT()
  const duration = data.lap_time_ms ?? 90_000
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const rafRef    = useRef<number | null>(null)
  const lastTRef  = useRef<number | null>(null)

  const nSamples = data.channels.lat?.length ?? 1

  useImperativeHandle(ref, () => ({
    seek(p: number) {
      setPlaying(false)
      onPlayingChange?.(false)
      lastTRef.current = null
      setProgress(Math.max(0, Math.min(1, p)))
    },
    togglePlay() {
      setPlaying(prev => {
        const next = !prev
        onPlayingChange?.(next)
        if (next) lastTRef.current = null
        return next
      })
    },
    stepFrame(dir: 1 | -1) {
      setPlaying(false)
      onPlayingChange?.(false)
      lastTRef.current = null
      setProgress(prev => Math.max(0, Math.min(1, prev + dir / (nSamples - 1))))
    },
  }))

  // Zoom-follow
  const FOLLOW_ZOOM = 5
  const [zoom, setZoom] = useState(1)
  const zoomRef    = useRef(1)
  const zoomRafRef = useRef<number | null>(null)

  // Smoothed pan centre (in SVG coords) — lerped to follow the car
  const panRef    = useRef<[number, number] | null>(null)
  const [pan, setPan] = useState<[number, number]>([0, 0])

  useEffect(() => {
    const target = isFullscreen ? FOLLOW_ZOOM : 1
    if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current)
    function step() {
      const delta = target - zoomRef.current
      if (Math.abs(delta) < 0.005) { zoomRef.current = target; setZoom(target); return }
      zoomRef.current += delta * 0.12
      setZoom(zoomRef.current)
      zoomRafRef.current = requestAnimationFrame(step)
    }
    zoomRafRef.current = requestAnimationFrame(step)
    return () => { if (zoomRafRef.current) cancelAnimationFrame(zoomRafRef.current) }
  }, [isFullscreen])

  useEffect(() => { onProgress?.(progress) }, [progress, onProgress])

  const { leftPoints, rightPoints, surfacePoints, racingXs, racingYs, racingCumDist, racingLength,
          colorSegs, finishX, finishY, finishAngleDeg, finishHalfLen, sectorPts, projectionParams } = useMemo(() => {
    const { lat, lon, path_lateral, track_edge } = data.channels
    const n = lat.length

    // 1. Tangent vector in metres
    const dlonM = gradient(lon).map(v => v * M_PER_DEG_LON)
    const dlatM = gradient(lat).map(v => v * M_PER_DEG_LAT)

    // 2. Normalise tangent → perpendicular normal in degrees
    const nxDeg = new Array(n)
    const nyDeg = new Array(n)
    for (let i = 0; i < n; i++) {
      const mag = Math.sqrt(dlonM[i] ** 2 + dlatM[i] ** 2) || 1
      const tx = dlonM[i] / mag
      const ty = dlatM[i] / mag
      // rotate 90° CCW → left normal
      nxDeg[i] =  ty / M_PER_DEG_LON
      nyDeg[i] = -tx / M_PER_DEG_LAT
    }

    // 3. Centre line = GPS − path_lateral × normal
    const centerLon = lon.map((v, i) => v - path_lateral[i] * nxDeg[i])
    const centerLat = lat.map((v, i) => v - path_lateral[i] * nyDeg[i])

    // 4. Recompute normal on centre line for perpendicular edges
    const cdlonM = gradient(centerLon).map(v => v * M_PER_DEG_LON)
    const cdlatM = gradient(centerLat).map(v => v * M_PER_DEG_LAT)
    const cnxDeg = new Array(n)
    const cnyDeg = new Array(n)
    for (let i = 0; i < n; i++) {
      const mag = Math.sqrt(cdlonM[i] ** 2 + cdlatM[i] ** 2) || 1
      const tx = cdlonM[i] / mag
      const ty = cdlatM[i] / mag
      cnxDeg[i] =  ty / M_PER_DEG_LON
      cnyDeg[i] = -tx / M_PER_DEG_LAT
    }

    // 5. Half-width from track_edge at p95 (avoids pit/outlier inflation)
    const absEdge = track_edge.map(Math.abs)
    const halfWidth = percentile95(absEdge)

    const leftLon  = centerLon.map((v, i) => v + halfWidth * cnxDeg[i])
    const leftLat  = centerLat.map((v, i) => v + halfWidth * cnyDeg[i])
    const rightLon = centerLon.map((v, i) => v - halfWidth * cnxDeg[i])
    const rightLat = centerLat.map((v, i) => v - halfWidth * cnyDeg[i])

    // 6. Project all to SVG — use centre line bounding box so everything aligns
    const allLons = [...centerLon, ...leftLon, ...rightLon]
    const allLats = [...centerLat, ...leftLat, ...rightLat]
    const pad = 24
    const [cxs, cys] = toSvg(allLons, allLats, pad, width, height)
    const mid = n

    const [racingXs, racingYs] = toSvg(lon, lat, pad, width, height)
    
    // Calculate projection parameters for the racing line (needed for ghost car)
    const minLon = Math.min(...lon), maxLon = Math.max(...lon)
    const minLat = Math.min(...lat), maxLat = Math.max(...lat)
    const rangeLon = maxLon - minLon || 1
    const rangeLat = maxLat - minLat || 1
    const usableW = width - 2 * pad
    const usableH = height - 2 * pad
    const scaleLon = usableW / rangeLon
    const scaleLat = usableH / rangeLat
    const scale = Math.min(scaleLon, scaleLat)
    const offX = pad + (usableW - rangeLon * scale) / 2
    const offY = pad + (usableH - rangeLat * scale) / 2

    const leftXs  = cxs.slice(mid, mid + n)
    const leftYs  = cys.slice(mid, mid + n)
    const rightXs = cxs.slice(mid + n)
    const rightYs = cys.slice(mid + n)

    // Polygon: left border forward → right border reversed → forms closed track surface
    const surfacePoints = polyPoints(
      [...leftXs, ...rightXs.slice().reverse()],
      [...leftYs, ...rightYs.slice().reverse()]
    )

    const cumDist = polylineCumDist(racingXs, racingYs)
    const racingLength = cumDist[cumDist.length - 1] ?? 0

    // Animated color segments — intensity driven by throttle/brake %
    // Values are 0-100; normalize to 0-1 and quantize to 5% steps
    function segKey(t: number, b: number): string {
      const bq = Math.round((b / 100) * 20) / 20
      const tq = Math.round((t / 100) * 20) / 20
      if (bq > 0) return `b${bq}`
      if (tq > 0) return `t${tq}`
      return 'c'
    }
    function segColor(t: number, b: number): string {
      const bq = Math.round((b / 100) * 20) / 20
      const tq = Math.round((t / 100) * 20) / 20
      if (bq > 0) {
        // Red: dim at low brake → bright vivid red at full brake
        const r = Math.round(80 + 175 * bq)
        const g = Math.round(15 * (1 - bq))
        const bl = Math.round(10 * (1 - bq))
        return `rgb(${r},${g},${bl})`
      }
      if (tq > 0) {
        // Green: dim at low throttle → bright vivid green at full throttle
        const r = Math.round(10 * (1 - tq))
        const g = Math.round(70 + 185 * tq)
        const bl = Math.round(10 + 20 * tq)
        return `rgb(${r},${g},${bl})`
      }
      return '#475569'  // coast — slate grey
    }
    const thr = data.channels.throttle
    const brk = data.channels.brake
    const colorSegs: { d: string; color: string; arcStart: number; arcEnd: number; pixLen: number }[] = []
    if (thr && brk) {
      const nSeg = Math.min(racingXs.length - 1, thr.length - 1, brk.length - 1)
      let i = 0
      while (i < nSeg) {
        const key = segKey(thr[i] ?? 0, brk[i] ?? 0)
        const color = segColor(thr[i] ?? 0, brk[i] ?? 0)
        let j = i + 1
        while (j < nSeg && segKey(thr[j] ?? 0, brk[j] ?? 0) === key) j++
        let d = `M${racingXs[i].toFixed(1)},${racingYs[i].toFixed(1)}`
        for (let k = i + 1; k <= j; k++) d += `L${racingXs[k].toFixed(1)},${racingYs[k].toFixed(1)}`
        colorSegs.push({ d, color, arcStart: cumDist[i], arcEnd: cumDist[j], pixLen: cumDist[j] - cumDist[i] })
        i = j
      }
    }

    // Finish line: perpendicular to track direction at index 0
    const finishX = racingXs[0], finishY = racingYs[0]
    const fdx = (racingXs[1] ?? racingXs[0]) - racingXs[0]
    const fdy = (racingYs[1] ?? racingYs[0]) - racingYs[0]
    const finishAngleDeg = Math.atan2(fdy, fdx) * 180 / Math.PI
    // Half-length = half pixel distance between left/right borders at index 0
    const edgeDx = leftXs[0] - rightXs[0], edgeDy = leftYs[0] - rightYs[0]
    const finishHalfLen = Math.max(Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) / 2, 14)

    // Sector marker positions + track angles
    const sectorPts = (data.sector_dists ?? []).map((dist, si) => {
      const ld = data.lap_dist
      if (!ld || ld.length < 2) return null
      let idx = 0, best = Infinity
      for (let k = 0; k < ld.length; k++) {
        const d = Math.abs(ld[k] - dist)
        if (d < best) { best = d; idx = k }
      }
      const pi = Math.max(0, idx - 1), ni = Math.min(racingXs.length - 1, idx + 1)
      const angle = Math.atan2(racingYs[ni] - racingYs[pi], racingXs[ni] - racingXs[pi]) * 180 / Math.PI
      return { x: racingXs[idx], y: racingYs[idx], angle, label: `S${si + 2}` }
    }).filter(Boolean) as { x: number; y: number; angle: number; label: string }[]

    // (panXs/panYs removed — they introduced ∼7s centering lag due to centered moving average)

    return {
      leftPoints:  polyPoints(leftXs, leftYs),
      rightPoints: polyPoints(rightXs, rightYs),
      surfacePoints,
      racingXs,
      racingYs,
      racingCumDist: cumDist,
      racingLength,
      colorSegs,
      finishX, finishY, finishAngleDeg, finishHalfLen,
      sectorPts,
      // Export projection params for ghost
      projectionParams: { minLon, maxLon, minLat, maxLat, scale, offX, offY, pad },
    }
  }, [data, width, height])

  // Ghost car geometry — compute SVG coordinates using SAME projection as main track
  const ghostGeo = useMemo(() => {
    if (!ghostData || !projectionParams) return null
    const { lat: ghostLat, lon: ghostLon } = ghostData.channels
    if (!ghostLat || !ghostLon || ghostLat.length < 2) return null
    
    // Filter out null values and keep only valid pairs
    const validIndices: number[] = []
    for (let i = 0; i < ghostLat.length; i++) {
      if (ghostLat[i] != null && ghostLon[i] != null) {
        validIndices.push(i)
      }
    }
    if (validIndices.length < 2) return null
    
    const filteredLat = validIndices.map(i => ghostLat[i] as number)
    const filteredLon = validIndices.map(i => ghostLon[i] as number)
    const filteredLapDist = validIndices.map(i => ghostData.lap_dist[i] ?? 0)
    
    // Use projection params from main track
    const { minLon, maxLat, scale, offX, offY } = projectionParams
    
    // Project ghost coordinates using main track's projection
    const ghostXs = filteredLon.map(v => offX + (v - minLon) * scale)
    const ghostYs = filteredLat.map(v => offY + (maxLat - v) * scale)  // flip Y
    const ghostCumDist = polylineCumDist(ghostXs, ghostYs)
    
    // Ghost color segments: yellow = throttle, blue = brake
    const ghostThr = ghostData.channels.throttle
    const ghostBrk = ghostData.channels.brake
    const ghostColorSegs: { d: string; color: string; arcStart: number; arcEnd: number; pixLen: number }[] = []
    if (ghostThr && ghostBrk) {
      const nSeg = Math.min(ghostXs.length - 1, ghostThr.length - 1, ghostBrk.length - 1)
      let i = 0
      while (i < nSeg) {
        const bi = validIndices[i]
        const bq = Math.round(((ghostBrk[bi] ?? 0) / 100) * 20) / 20
        const tq = Math.round(((ghostThr[bi] ?? 0) / 100) * 20) / 20
        const key = bq > 0 ? `b${bq}` : tq > 0 ? `t${tq}` : 'c'
        let j = i + 1
        while (j < nSeg) {
          const bj = validIndices[j]
          const bq2 = Math.round(((ghostBrk[bj] ?? 0) / 100) * 20) / 20
          const tq2 = Math.round(((ghostThr[bj] ?? 0) / 100) * 20) / 20
          const k2 = bq2 > 0 ? `b${bq2}` : tq2 > 0 ? `t${tq2}` : 'c'
          if (k2 !== key) break
          j++
        }
        // Yellow for throttle, blue for brake, dim grey for coast
        let color: string
        if (bq > 0) {
          const a = Math.min(bq, 1)
          color = `rgba(56,189,248,${0.3 + 0.5 * a})`  // sky-400
        } else if (tq > 0) {
          const a = Math.min(tq, 1)
          color = `rgba(250,204,21,${0.3 + 0.5 * a})`  // yellow-400
        } else {
          color = 'rgba(100,116,139,0.25)'
        }
        let d = `M${ghostXs[i].toFixed(1)},${ghostYs[i].toFixed(1)}`
        for (let k = i + 1; k <= j; k++) d += `L${ghostXs[k].toFixed(1)},${ghostYs[k].toFixed(1)}`
        ghostColorSegs.push({ d, color, arcStart: ghostCumDist[i], arcEnd: ghostCumDist[j] ?? ghostCumDist[ghostCumDist.length - 1], pixLen: (ghostCumDist[j] ?? ghostCumDist[ghostCumDist.length - 1]) - ghostCumDist[i] })
        i = j
      }
    }

    return { ghostXs, ghostYs, ghostCumDist, ghostLapDist: filteredLapDist, ghostColorSegs }
  }, [ghostData, projectionParams])

  // RAF animation loop
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastTRef.current = null
      return
    }
    // reset lastT whenever we (re)start so delta doesn't jump
    lastTRef.current = null
    function step(time: number) {
      if (lastTRef.current === null) lastTRef.current = time
      const delta = time - lastTRef.current
      lastTRef.current = time
      setProgress(prev => {
        const next = prev + delta / duration
        if (next >= 1) { setPlaying(false); onPlayingChange?.(false); return 1 }
        return next
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [playing])

  function handlePlay() {
    if (playing) {
      setPlaying(false)
      onPlayingChange?.(false)
    } else {
      if (progress >= 1) setProgress(0)
      setPlaying(true)
      onPlayingChange?.(true)
    }
  }

  function handleRestart() {
    setPlaying(false)
    onPlayingChange?.(false)
    setProgress(0)
  }

  // Time-based target pixel distance — progress is a time fraction (0-1),
  // samples are at fixed 10 Hz, so index = progress * (n-1) corresponds to
  // actual position. Interpolate cumDist at that index.
  const targetDist = useMemo(() => {
    const n = racingXs.length
    const exactIdx = progress * (n - 1)
    const i0 = Math.floor(exactIdx)
    const frac = exactIdx - i0
    if (i0 >= n - 1) return racingCumDist[n - 1] ?? 0
    return (racingCumDist[i0] ?? 0) + frac * ((racingCumDist[i0 + 1] ?? 0) - (racingCumDist[i0] ?? 0))
  }, [progress, racingXs, racingCumDist])
  const [carX, carY] = interpolateArc(racingXs, racingYs, racingCumDist, Math.min(targetDist, racingLength - 0.001))
  const finished     = progress >= 1
  const elapsedMs    = Math.min(progress * duration, duration)

  // Ghost car position — TIME-synchronized (where was ghost at this elapsed time?)
  const ghostProgress = useMemo(() => {
    if (!ghostGeo || !ghostData?.lap_time_ms || progress === 0 || progress >= 1) return null
    const ghostDuration = ghostData.lap_time_ms
    // Elapsed wall-clock time
    const elapsedMs = progress * duration
    // Ghost's time fraction in its own lap
    const ghostTimeFrac = Math.min(elapsedMs / ghostDuration, 1)
    return ghostTimeFrac
  }, [ghostGeo, ghostData, progress, duration])

  const ghostPos = useMemo(() => {
    if (!ghostGeo || ghostProgress == null) return null
    const { ghostXs, ghostYs, ghostCumDist } = ghostGeo
    const n = ghostXs.length
    // Sample index at ghost's time fraction (samples are uniform 10 Hz)
    const exactIdx = ghostProgress * (n - 1)
    const i0 = Math.floor(exactIdx)
    const frac = exactIdx - i0
    let targetPixDist: number
    if (i0 >= n - 1) {
      targetPixDist = ghostCumDist[n - 1]
    } else {
      targetPixDist = ghostCumDist[i0] + frac * (ghostCumDist[i0 + 1] - ghostCumDist[i0])
    }
    return interpolateArc(ghostXs, ghostYs, ghostCumDist, targetPixDist)
  }, [ghostGeo, ghostProgress])

  // Pan: accumulated in RAF at 60fps with tiny alpha — stays centered on car, no lag
  // alpha=0.04 @ 60fps → ~95% convergence in ~1.2s, enough to hide GPS jitter
  useEffect(() => {
    if (!panRef.current) { panRef.current = [carX, carY]; setPan([carX, carY]); return }
    const ALPHA = 0.04
    const [px, py] = panRef.current
    const nx = px + (carX - px) * ALPHA
    const ny = py + (carY - py) * ALPHA
    panRef.current = [nx, ny]
    setPan([nx, ny])
  }, [carX, carY])

  // SVG group transform: center on smoothed pan position at current zoom level
  const groupTransform = zoom > 1.01
    ? `translate(${width / 2 - pan[0] * zoom} ${height / 2 - pan[1] * zoom}) scale(${zoom})`
    : undefined

  return (
    <div style={{ position: 'relative', display: 'block', width: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', background: '#16213e', borderRadius: 8, display: 'block' }}
      >
        <g transform={groupTransform}>
        {/* Track surface fill (dark asphalt) */}
        <polygon points={surfacePoints} fill="#0d1117" stroke="none" />

        {/* Track borders */}
        <polyline points={leftPoints}  fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={1.2 / zoom} />
        <polyline points={rightPoints} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={1.2 / zoom} />

        {/* Ghost trail — yellow throttle / blue brake (rendered BELOW current trail) */}
        {ghostGeo && ghostProgress != null && ghostProgress > 0 && ghostGeo.ghostColorSegs.map((seg, si) => {
          const ghostCd = ghostGeo.ghostCumDist
          const n = ghostGeo.ghostXs.length
          const exactIdx = ghostProgress * (n - 1)
          const i0g = Math.floor(exactIdx)
          const fracG = exactIdx - i0g
          const ghostTargetPix = i0g >= n - 1 ? ghostCd[n - 1] : ghostCd[i0g] + fracG * (ghostCd[i0g + 1] - ghostCd[i0g])
          if (seg.arcStart >= ghostTargetPix) return null
          if (seg.arcEnd <= ghostTargetPix) {
            return <path key={`g${si}`} d={seg.d} fill="none" stroke={seg.color}
              strokeWidth={4.5 / zoom} strokeLinecap="round" strokeLinejoin="round" />
          }
          const vis = ghostTargetPix - seg.arcStart
          return <path key={`g${si}`} d={seg.d} fill="none" stroke={seg.color}
            strokeWidth={4.5 / zoom} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={seg.pixLen} strokeDashoffset={seg.pixLen - vis} />
        })}

        {/* Animated color segments — reveal as progress advances */}
        {colorSegs.map((seg, si) => {
          if (progress === 0 || seg.arcStart >= targetDist) return null
          if (seg.arcEnd <= targetDist) {
            return <path key={si} d={seg.d} fill="none" stroke={seg.color}
              strokeWidth={6 / zoom} strokeLinecap="round" strokeLinejoin="round" />
          }
          const vis = targetDist - seg.arcStart
          return <path key={si} d={seg.d} fill="none" stroke={seg.color}
            strokeWidth={6 / zoom} strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray={seg.pixLen} strokeDashoffset={seg.pixLen - vis} />
        })}

        {/* Sector markers — fixed size, perpendicular to track */}
        {sectorPts.map((pt, i) => {
          const hw = 18  // half-length in SVG units (track-width-independent)
          return (
            <g key={i} transform={`rotate(${pt.angle}, ${pt.x}, ${pt.y})`}>
              <rect x={pt.x - 2} y={pt.y - hw} width={4} height={hw * 2}
                fill="#f59e0b" opacity={0.95} rx={1} />
              {/* Label rendered without rotation, reset transform */}
              <text
                transform={`rotate(${-pt.angle}, ${pt.x + 10}, ${pt.y - hw + 4})`}
                x={pt.x + 10} y={pt.y - hw + 12}
                fill="#f59e0b" fontSize={11}
                fontFamily="sans-serif" fontWeight="bold">
                {pt.label}
              </text>
            </g>
          )
        })}

        {/* Checkered finish line */}
        <defs>
          <pattern id="checker" x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="black"/>
            <rect width="2.5" height="2.5" fill="white"/>
            <rect x="2.5" y="2.5" width="2.5" height="2.5" fill="white"/>
          </pattern>
        </defs>
        {racingXs.length > 1 && (
          <>
            <rect
              x={finishX - 3.5} y={finishY - finishHalfLen}
              width={7} height={finishHalfLen * 2}
              fill="url(#checker)"
              transform={`rotate(${finishAngleDeg}, ${finishX}, ${finishY})`}
            />
            <text x={finishX + 8} y={finishY - finishHalfLen + 12}
              fill="#f59e0b" fontSize={11} fontFamily="sans-serif" fontWeight="bold">S1</text>
          </>
        )}

        {/* Ghost car marker (saved best lap) — yellow */}
        {ghostPos && progress > 0 && progress < 1 && (
          <circle cx={ghostPos[0]} cy={ghostPos[1]} r={5 / zoom} fill="#facc15" stroke="#fff" strokeWidth={1.5 / zoom} opacity={0.85} />
        )}

        {/* Car marker — radius and stroke scaled inversely with zoom */}
        {progress > 0 && progress < 1 && (
          <circle cx={carX} cy={carY} r={5 / zoom} fill="#facc15" stroke="#fff" strokeWidth={1.5 / zoom} />
        )}

        {/* Start/finish dot behind the flag */}
        {racingXs.length > 0 && progress === 0 && (
          <circle cx={finishX} cy={finishY} r={4} fill="#ffffff" stroke="#0d0f14" strokeWidth={2} />
        )}
        </g>
      </svg>

      {/* Timer overlay */}
      {(playing || progress > 0) && (
        <div
          style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)' }}
          className="px-3 py-1 rounded-full bg-black/60 border border-white/15 font-mono text-sm tabular-nums"
        >
          <span className={finished ? 'text-lmu-accent' : 'text-white'}>
            {fmtMs(elapsedMs)}
          </span>
          {data.lap_time_ms && (
            <span className="text-gray-500 text-xs ml-1">/ {fmtMs(data.lap_time_ms)}</span>
          )}
        </div>
      )}

      {/* Ghost legend overlay */}
      {ghostData && (playing || progress > 0) && (
        <div
          style={{ position: 'absolute', top: 14, left: 14 }}
          className="flex items-center gap-2 px-2 py-1 rounded bg-black/60 border border-white/15 text-xs"
        >
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          <span className="text-yellow-400">Best: {fmtMs(ghostData.lap_time_ms ?? 0)}</span>
        </div>
      )}

      {/* Controls overlay */}
      <div style={{ position: 'absolute', bottom: 14, right: 14 }} className="flex items-center gap-2">
        {(progress > 0) && (
          <button
            onClick={handleRestart}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-black/60 border border-white/20 hover:bg-white/10 transition-colors text-white"
            title={t.restart}
          >
            <RestartIcon />
          </button>
        )}
        <button
          onClick={isFullscreen ? onExitFullscreen : handlePlay}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-black/70 border border-white/20 hover:bg-lmu-accent/80 transition-colors text-white"
          title={isFullscreen ? t.exitFullscreen : finished ? t.repeat : t.fullscreen}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : finished ? <RestartIcon /> : <EnterFullscreenIcon />}
        </button>
      </div>
    </div>
  )
})

export default TrackMap

function EnterFullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function ExitFullscreenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <line x1="21" y1="3" x2="14" y2="10" />
    </svg>
  )
}

function RestartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
    </svg>
  )
}
