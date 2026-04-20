import { useMemo } from 'react'

interface Props {
  lat: number[]
  lon: number[]
  width?: number
  height?: number
  className?: string
}

function toSvgCoords(
  lons: number[], lats: number[],
  padding: number, width: number, height: number
): [number[], number[]] {
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const rangeLon = maxLon - minLon || 1
  const rangeLat = maxLat - minLat || 1
  const usableW = width - 2 * padding
  const usableH = height - 2 * padding
  const scale = Math.min(usableW / rangeLon, usableH / rangeLat)
  const offX = padding + (usableW - rangeLon * scale) / 2
  const offY = padding + (usableH - rangeLat * scale) / 2
  const xs = lons.map(v => offX + (v - minLon) * scale)
  const ys = lats.map(v => offY + (maxLat - v) * scale)
  return [xs, ys]
}

export default function MiniTrackMap({ lat, lon, width = 200, height = 120, className }: Props) {
  const points = useMemo(() => {
    if (lat.length < 2) return ''
    const [xs, ys] = toSvgCoords(lon, lat, 8, width, height)
    return xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  }, [lat, lon, width, height])

  if (!points) return null

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {/* Glow filter */}
      <defs>
        <filter id="mini-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Shadow track */}
      <polyline
        points={points}
        fill="none"
        stroke="#ffffff18"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Main track line */}
      <polyline
        points={points}
        fill="none"
        stroke="#facc15"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#mini-glow)"
        opacity={0.9}
      />
    </svg>
  )
}
