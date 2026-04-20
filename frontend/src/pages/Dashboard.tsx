import { useRef, useState, useEffect } from 'react'
import type { TrackMapHandle } from '../components/TrackMap'
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'
import api from '../lib/api'
import { openFile, closeConnection } from '../lib/duckdb'
import { extractSession, loadLapLayout, buildSaveTelemetry, type ExtractedLap } from '../lib/telemetryReader'
import CircuitsGrid from '../components/CircuitsGrid'
import TrackMap from '../components/TrackMap'
import { type GhostTelemetry } from '../components/TelemetryPanel'
import SlipAngleCar from '../components/SlipAngleCar'
import RearViewCar from '../components/RearViewCar'
import LeftView from '../components/LeftView'
import RightView from '../components/RightView'
import TelemetryChart from '../components/TelemetryChart'
import { fmtMs, type LayoutData, type LapInfo } from '../types/telemetry'
import { exportLapToMoTeCCSV, downloadCSV } from '../lib/motecExport'
import { useT } from '../contexts/LanguageContext'

type Status = 'idle' | 'uploading' | 'loading' | 'done' | 'error'

export default function Dashboard() {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [lapLoading, setLapLoading] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [track, setTrack] = useState<string>('')
  const [recordedAt, setRecordedAt] = useState<string | null>(null)
  const [laps, setLaps] = useState<LapInfo[]>([])
  const [selectedLap, setSelectedLap] = useState<number | null>(null)
  const [layout, setLayout] = useState<LayoutData | null>(null)
  const [playProgress, setPlayProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [inFullscreen, setInFullscreen] = useState(false)
  const trackMapRef = useRef<TrackMapHandle>(null)
  const smoothDeltaRef = useRef(0)
  const [view, setView] = useState<'map' | 'telemetry'>('map')
  const [panelsOpen, setPanelsOpen] = useState(false)

  // DuckDB connection + extracted lap metadata (client-side processing)
  const duckConnRef = useRef<AsyncDuckDBConnection | null>(null)
  const lapLoadingInProgress = useRef(false)
  const [extractedLaps, setExtractedLaps] = useState<ExtractedLap[]>([])

  const [visiblePanels, setVisiblePanels] = useState({
    delta:     true,
    slipAngle: true,
    rearView:  true,
    rightSusp: true,
    leftSusp:  true,
    tc:        true,
    abs:       true,
    gear:      true,
    throttle:  true,
    brake:     true,
  })
  function togglePanel(key: keyof typeof visiblePanels) {
    setVisiblePanels(p => ({ ...p, [key]: !p[key] }))
  }
  
  // Saved lap state
  const [saving, setSaving] = useState(false)
  const [circuitNotApproved, setCircuitNotApproved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }
  
  // Ghost comparison state
  const [compareWithBest, setCompareWithBest] = useState(false)
  const [ghostData, setGhostData] = useState<{
    lap_dist: number[]
    lap_time_ms: number | null
    channels: { lat: number[]; lon: number[]; throttle?: number[]; brake?: number[] }
  } | null>(null)
  const [ghostTelemetry, setGhostTelemetry] = useState<GhostTelemetry | null>(null)

  // Cleanup DuckDB connection on unmount
  useEffect(() => {
    return () => {
      if (duckConnRef.current) {
        closeConnection(duckConnRef.current).catch(() => {})
      }
    }
  }, [])

  // Check if there's a saved lap for this track
  useEffect(() => {
    if (!track) {
      setGhostData(null)
      return
    }
    api.get(`/api/saved-laps/${encodeURIComponent(track)}`)
      .then(res => {
        if (res.data.telemetry) {
          const tel = res.data.telemetry
          setGhostData({
            lap_dist: tel.lap_dist,
            lap_time_ms: res.data.lap_time_ms,
            channels: { lat: tel.channels.lat, lon: tel.channels.lon, throttle: tel.channels.throttle, brake: tel.channels.brake },
          })
          setGhostTelemetry({
            lap_dist: tel.lap_dist,
            lap_time_ms: res.data.lap_time_ms,
            channels: {
              speed_kmh: tel.channels.speed_kmh,
              throttle:  tel.channels.throttle,
              brake:     tel.channels.brake,
              steering:  tel.channels.steering,
              gear:      tel.channels.gear,
              g_lat:          tel.channels.g_lat,
              g_lon:          tel.channels.g_lon,
              tc:             tel.channels.tc,
              abs:            tel.channels.abs,
              abs_level:      tel.channels.abs_level,
              slip_angle_deg: tel.channels.slip_angle_deg,
              susp_pos_fl:    tel.channels.susp_pos_fl,
              susp_pos_fr:    tel.channels.susp_pos_fr,
              susp_pos_rl:    tel.channels.susp_pos_rl,
              susp_pos_rr:    tel.channels.susp_pos_rr,
              ride_height_fl: tel.channels.ride_height_fl,
              ride_height_fr: tel.channels.ride_height_fr,
              ride_height_rl: tel.channels.ride_height_rl,
              ride_height_rr: tel.channels.ride_height_rr,
              rear_3rd_defl:  tel.channels.rear_3rd_defl,
              g_vert:         tel.channels.g_vert,
            },
          })
        }
      })
      .catch(() => {
        setGhostData(null)
        setGhostTelemetry(null)
      })
  }, [track])

  async function saveLap() {
    if (selectedLap == null || !layout) return
    const lap = extractedLaps.find(l => l.num === selectedLap)
    if (!lap) return
    setSaving(true)
    setError(null)
    try {
      const telemetry = buildSaveTelemetry(layout)
      const { data } = await api.post(`/api/saved-laps`, {
        track,
        lap_time_ms: lap.lapTimeMsValid,
        sector1_ms: lap.sector1Ms,
        sector2_ms: lap.sector2Ms,
        sector3_ms: lap.sector3Ms,
        telemetry,
      })
      showToast(`${t.savedLapToast} · ${fmtMs(data.lap_time_ms)}`)
      // Use the saved telemetry as ghost
      const tel = telemetry
      setGhostData({
        lap_dist: tel.lap_dist as number[],
        lap_time_ms: lap.lapTimeMsValid,
        channels: { lat: tel.channels.lat as number[], lon: tel.channels.lon as number[], throttle: tel.channels.throttle as number[], brake: tel.channels.brake as number[] },
      })
      setGhostTelemetry({
        lap_dist: tel.lap_dist as number[],
        lap_time_ms: lap.lapTimeMsValid,
        channels: {
          speed_kmh: tel.channels.speed_kmh as number[],
          throttle:  tel.channels.throttle as number[],
          brake:     tel.channels.brake as number[],
          steering:  tel.channels.steering as number[],
          gear:      tel.channels.gear as number[],
          g_lat:          tel.channels.g_lat as number[],
          g_lon:          tel.channels.g_lon as number[],
          tc:             tel.channels.tc as number[],
          abs:            tel.channels.abs as number[],
          abs_level:      tel.channels.abs_level as number[],
          slip_angle_deg: tel.channels.slip_angle_deg as number[],
          susp_pos_fl:    tel.channels.susp_pos_fl as number[],
          susp_pos_fr:    tel.channels.susp_pos_fr as number[],
          susp_pos_rl:    tel.channels.susp_pos_rl as number[],
          susp_pos_rr:    tel.channels.susp_pos_rr as number[],
          ride_height_fl: tel.channels.ride_height_fl as number[],
          ride_height_fr: tel.channels.ride_height_fr as number[],
          ride_height_rl: tel.channels.ride_height_rl as number[],
          ride_height_rr: tel.channels.ride_height_rr as number[],
          rear_3rd_defl:  tel.channels.rear_3rd_defl as number[],
          g_vert:         tel.channels.g_vert as number[],
        },
      })
    } catch (e: any) {
      setError(t.saveLapError)
    } finally {
      setSaving(false)
    }
  }

  async function loadLayout(lapNumber: number, lapOverride?: ExtractedLap) {
    if (lapLoadingInProgress.current) return   // prevent concurrent Wasm queries
    const conn = duckConnRef.current
    const lap = lapOverride ?? extractedLaps.find(l => l.num === lapNumber)
    if (!conn || !lap) return
    lapLoadingInProgress.current = true
    setLapLoading(lapNumber)
    setError(null)
    setPlayProgress(0)
    setView('map')
    try {
      const data = await loadLapLayout(conn, lap.tsStart, lap.tsEnd)
      data.lap_time_ms = lap.lapTimeMsValid
      data.valid = lap.valid
      setLayout(data)
      setSelectedLap(lapNumber)
    } catch (e: any) {
      setError(t.loadLayoutError)
    } finally {
      lapLoadingInProgress.current = false
      setLapLoading(null)
    }
  }

  async function loadSavedLap(trackName: string) {
    setError(null)
    setLayout(null)
    setLaps([])
    setSelectedLap(null)
    setStatus('loading')
    setTrack(trackName)
    try {
      const { data } = await api.get(
        `/api/saved-laps/${encodeURIComponent(trackName)}`,
      )
      const tel = data.telemetry
      const layoutData: LayoutData = {
        lap_dist: tel.lap_dist,
        lap_time_ms: data.lap_time_ms,
        valid: true,
        channels: tel.channels,
      }
      setLayout(layoutData)
      setLaps([{ lap_number: 1, lap_time_ms: data.lap_time_ms, valid: true }])
      setSelectedLap(1)
      setStatus('done')
    } catch (e: any) {
      setError(t.loadSavedLapError)
      setStatus('error')
    }
  }

  async function handleFile(file: File) {
    setError(null)
    setLayout(null)
    setLaps([])
    setSelectedLap(null)
    setExtractedLaps([])
    setCircuitNotApproved(false)
    setStatus('uploading')

    try {
      // Close previous connection if any
      if (duckConnRef.current) {
        await closeConnection(duckConnRef.current).catch(() => {})
        duckConnRef.current = null
      }

      // Open file client-side with duckdb-wasm
      const { conn } = await openFile(file)
      duckConnRef.current = conn

      // Extract session metadata and laps
      const session = await extractSession(conn, file.name)
      setTrack(session.track)
      setRecordedAt(session.recordedAt)
      setExtractedLaps(session.laps)

      const allLaps = session.lapInfos
      setLaps(allLaps)
      setStatus('loading')

      // Persist session metadata to backend
      try {
        await api.post('/api/sessions', {
          track: session.track,
          session_type: session.sessionType,
          recorded_at: session.recordedAt,
          filename: file.name,
          size_bytes: file.size,
          laps: session.laps.map(l => ({
            lap_number: l.num,
            lap_time_ms: l.lapTimeMsValid,
            sector1_ms: l.sector1Ms,
            sector2_ms: l.sector2Ms,
            sector3_ms: l.sector3Ms,
            valid: l.valid,
            ts_start: l.tsStart,
            ts_end: l.tsEnd,
          })),
        })
        setCircuitNotApproved(false)
      } catch (e: any) {
        const detail: string = e?.response?.data?.detail ?? ''
        if (e?.response?.status === 422 && detail.includes('not in the list of approved circuits'))
          setCircuitNotApproved(true)
        // Non-critical: session metadata save failed, continue with local data
      }

      // Auto-select best valid lap
      const validLaps = allLaps.filter(l => l.valid && l.lap_time_ms != null)
      if (validLaps.length === 0) {
        setError(t.noValidLaps)
        setStatus('error')
        return
      }
      const bestInfo = validLaps.reduce((b, l) =>
        (l.lap_time_ms ?? Infinity) < (b.lap_time_ms ?? Infinity) ? l : b,
      )
      const bestExtracted = session.laps.find(l => l.num === bestInfo.lap_number)
      await loadLayout(bestInfo.lap_number, bestExtracted)
      setStatus('done')
    } catch (e: any) {
      setError(t.fileProcessError)
      setStatus('error')
    }
  }

  const uploading = status === 'uploading'

  // Keyboard shortcuts: Space = play/pause, Escape = exit fullscreen, ←/→ = frame by frame
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't steal keys from inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!layout) return

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        trackMapRef.current?.togglePlay()
      } else if (e.key === 'Escape' && inFullscreen) {
        setInFullscreen(false)
        if (playing) trackMapRef.current?.togglePlay()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const nSamples = layout.channels.lat?.length ?? 1
        const step = 1 / Math.max(1, nSamples - 1)
        const next = Math.max(0, Math.min(1, playProgress + (e.key === 'ArrowRight' ? step : -step)))
        trackMapRef.current?.seek(next)
        setPlayProgress(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inFullscreen, playing, layout, playProgress])

  const bestTime = laps
    .filter(l => l.valid && l.lap_time_ms != null)
    .reduce<number | null>((best, l) =>
      best === null || (l.lap_time_ms ?? Infinity) < best ? l.lap_time_ms : best,
    null)

  // Smoothed delta vs ghost — EMA with alpha=0.07 to damp jitter
  let smoothedDeltaMs: number | null = null
  if (inFullscreen && compareWithBest && ghostTelemetry && layout?.lap_time_ms != null && ghostTelemetry.lap_time_ms != null) {
    const currentMs = playProgress * layout.lap_time_ms
    // Look up actual track distance at current time (samples are 10 Hz)
    const ldArr = layout.lap_dist
    const exactIdx = playProgress * (ldArr.length - 1)
    const i0 = Math.floor(exactIdx)
    const frac = exactIdx - i0
    const targetDist = i0 >= ldArr.length - 1
      ? ldArr[ldArr.length - 1] ?? 0
      : (ldArr[i0] ?? 0) + frac * ((ldArr[i0 + 1] ?? 0) - (ldArr[i0] ?? 0))
    const gd = ghostTelemetry.lap_dist
    let lo = 0, hi = gd.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if ((gd[mid] ?? 0) < targetDist) lo = mid + 1; else hi = mid }
    const ghostMs = (lo / Math.max(1, gd.length - 1)) * ghostTelemetry.lap_time_ms
    const rawDelta = currentMs - ghostMs
    smoothDeltaRef.current = smoothDeltaRef.current * 0.93 + rawDelta * 0.07
    smoothedDeltaMs = smoothDeltaRef.current
  }

  // Dynamic TC level at current playback position
  const tcLevelArr = layout?.channels.tc_level
  const currentTcLevel: number | null = tcLevelArr && tcLevelArr.length > 0
    ? (tcLevelArr[Math.round(playProgress * (tcLevelArr.length - 1))] ?? null)
    : (layout?.tc_level ?? null)

  return (
    <>
    <div className="space-y-6">
      {/* Loading saved lap */}
      {status === 'loading' && laps.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <Spinner />
          <span className="text-sm">{t.loadingLap}</span>
        </div>
      )}

      {/* Header — only shown when a session is loaded */}
      {laps.length > 0 && (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-bold">Live View</h2>
          <button
            disabled={!layout || selectedLap === null}
            onClick={() => {
              if (!layout || selectedLap === null) return
              const lapInfo = laps.find(l => l.lap_number === selectedLap)
              if (!lapInfo) return
              const csv = exportLapToMoTeCCSV(layout, lapInfo, track, recordedAt)
              const safeName = track.replace(/\s+/g, '_')
              downloadCSV(csv, `lap_${selectedLap}_${safeName}.csv`)
            }}
            title="Exports lap data as MoTeC i2 CSV (Format, Speed, Throttle, Brake, Steering, G-forces, etc.). Note: GPS coordinates are in LMU internal format, not WGS84 — the track map in MoTeC i2 may not display correctly."
            className={`px-3 py-1 text-sm border border-red-500 text-white rounded transition-opacity ${
              layout && selectedLap !== null
                ? 'opacity-100 hover:bg-red-500 cursor-pointer'
                : 'opacity-40 cursor-not-allowed'
            }`}
          >
            Export as MoTeC
          </button>
          <div className="relative group">
            <span className="flex items-center justify-center w-4 h-4 rounded-full border border-gray-500 text-gray-400 text-[10px] cursor-default select-none">?</span>
            <div className="absolute left-6 top-1/2 -translate-y-1/2 z-50 hidden group-hover:block w-72 bg-gray-800 border border-gray-600 text-gray-200 text-xs rounded p-2 shadow-lg pointer-events-none">
              <p className="font-semibold mb-1">{t.motecLimitations}</p>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>{t.motecGpsNote}</li>
                <li>{t.motecImportNote}</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle — only when a lap is loaded */}
          {layout && (
            <div className="flex items-center gap-3">
              {ghostData && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs text-gray-400">{t.compareWithBest}</span>
                  <button
                    onClick={() => setCompareWithBest(!compareWithBest)}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${
                      compareWithBest ? 'bg-yellow-500 justify-end' : 'bg-gray-600 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white shrink-0" />
                  </button>
                </label>
              )}
              <div className="inline-flex rounded-lg border border-lmu-highlight overflow-hidden">
                {(['map', 'telemetry'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      view === v
                        ? 'bg-lmu-accent text-white'
                        : 'text-gray-400 hover:text-white hover:bg-lmu-highlight/30'
                    }`}
                  >
                    {v === 'map' ? 'Map' : 'Telemetry'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 bg-lmu-accent hover:bg-yellow-400 disabled:opacity-50
                       text-black font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {uploading ? (
              <><Spinner />{t.uploading}</>
            ) : (
              <><UploadIcon />{t.loadSession}</>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".duckdb"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      )}

      {/* Hidden file input — always mounted so inputRef works from CircuitsGrid */}
      {laps.length === 0 && (
        <input
          ref={inputRef}
          type="file"
          accept=".duckdb"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-900/40 border border-red-600 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
          {error.toLowerCase().includes('memory access out of bounds') && (
            <p className="mt-1 text-red-400/80">
              {t.fileTooLarge}
            </p>
          )}
        </div>
      )}

      {/* Main content */}
      {laps.length === 0 && status !== 'uploading' && status !== 'loading' && (
        <CircuitsGrid
          onUpload={() => inputRef.current?.click()}
          uploading={uploading}
          onSelectCircuit={loadSavedLap}
        />
      )}
      {laps.length > 0 ? (
        <div className="flex gap-4 items-start">

          {/* ── Left panel: lap list ── */}
          <aside className="w-52 shrink-0 bg-lmu-secondary rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-lmu-highlight">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                {track || 'Circuito'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {laps.length} {laps.length !== 1 ? t.laps : t.lap}
              </p>
            </div>
            <ul className="divide-y divide-lmu-highlight/40">
              {laps.map(lap => {
                const isSelected = lap.lap_number === selectedLap
                const isBest = lap.lap_time_ms === bestTime && lap.valid
                const isLoading = lapLoading === lap.lap_number
                return (
                  <li key={lap.lap_number}>
                    <button
                      disabled={!lap.valid || isLoading}
                      onClick={() => loadLayout(lap.lap_number)}
                      className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2
                        transition-colors text-sm
                        ${isSelected
                          ? 'bg-lmu-accent/20 text-white'
                          : lap.valid
                            ? 'hover:bg-lmu-highlight/30 text-gray-300'
                            : 'opacity-40 cursor-not-allowed text-gray-500'}
                      `}
                    >
                      <span className="flex items-center gap-2 font-mono">
                        {isLoading
                          ? <Spinner />
                          : <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-lmu-accent' : 'bg-gray-600'}`} />
                        }
                        Lap {lap.lap_number}
                      </span>
                      <span className="flex items-center gap-1">
                        {isBest && (
                          <span className="text-[10px] px-1 rounded bg-lmu-accent/30 text-lmu-accent font-semibold leading-tight">
                            BEST
                          </span>
                        )}
                        <span className={`font-mono text-xs ${isSelected ? 'text-lmu-accent' : ''}`}>
                          {fmtMs(lap.lap_time_ms)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* ── Center: track map / telemetry ── */}
          <div className="flex-1 min-w-0 space-y-1">
            {layout ? (
              <>

                {view === 'map' ? (
                  <>
                    {/* Track name heading (non-fullscreen) */}
                    {!inFullscreen && track && (
                      <p className="text-xs font-semibold text-gray-400 tracking-widest uppercase mb-1 px-0.5">
                        {track}
                      </p>
                    )}
                    {/* TrackMap wrapper — goes fullscreen when playing */}
                    <div
                      className={inFullscreen ? 'fixed inset-0 z-50' : ''}
                      style={inFullscreen ? { background: '#0d1117' } : {}}
                    >
                      <TrackMap
                        ref={trackMapRef}
                        data={layout}
                        ghostData={compareWithBest ? ghostData : null}
                        width={inFullscreen ? window.innerWidth : 900}
                        height={inFullscreen ? window.innerHeight : 600}
                        onProgress={setPlayProgress}
                        isFullscreen={inFullscreen}
                        onExitFullscreen={() => { setInFullscreen(false); if (playing) trackMapRef.current?.togglePlay() }}
                        onPlayingChange={(p) => {
                          setPlaying(p)
                          if (p) setInFullscreen(true)
                        }}
                      />
                      {/* Panels dropdown — top center-right, next to timer */}
                      {inFullscreen && track && (
                        <div style={{ position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)', zIndex: 55, pointerEvents: 'none' }}>
                          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontFamily: 'sans-serif' }}>
                            {track}
                          </span>
                        </div>
                      )}
                      {/* Panels dropdown — top center-right, next to timer */}
                      {inFullscreen && (
                        <div style={{ position: 'absolute', top: 14, left: 'calc(50% + 90px)', zIndex: 60 }}>
                          <div style={{ position: 'relative' }}>
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); setPanelsOpen(o => !o) }}
                              title={t.showHidePanels}
                              style={{
                                height: 28, paddingLeft: 8, paddingRight: 10,
                                display: 'flex', alignItems: 'center', gap: 5,
                                background: panelsOpen ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.55)',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 14, cursor: 'pointer', color: 'white',
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
                                <rect x="1" y="1" width="6" height="6" rx="1" />
                                <rect x="9" y="1" width="6" height="6" rx="1" />
                                <rect x="1" y="9" width="6" height="6" rx="1" />
                                <rect x="9" y="9" width="6" height="6" rx="1" />
                              </svg>
                              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>{t.panels}</span>
                              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.6, marginLeft: 1 }}>
                                <polygon points={panelsOpen ? '0,6 4,2 8,6' : '0,2 4,6 8,2'} />
                              </svg>
                            </button>
                            {panelsOpen && (
                              <div
                                onMouseDown={e => e.stopPropagation()}
                                style={{
                                  position: 'absolute', top: 34, left: 0, minWidth: 170,
                                  background: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)',
                                  border: '1px solid rgba(255,255,255,0.10)',
                                  borderRadius: 10, overflow: 'hidden',
                                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                }}
                              >
                                {([
                                  { key: 'delta',     label: 'Delta ghost',   dot: '#facc15' },
                                  { key: 'slipAngle', label: 'Slip angle',    dot: '#a78bfa' },
                                  { key: 'rearView',  label: 'Rear view',     dot: '#818cf8' },
                                  { key: 'rightSusp', label: 'Right susp',    dot: '#67e8f9' },
                                  { key: 'leftSusp',  label: 'Left susp',     dot: '#34d399' },
                                  { key: 'tc',        label: 'TC chart',      dot: '#f97316' },
                                  { key: 'abs',       label: 'ABS chart',     dot: '#818cf8' },
                                  { key: 'gear',      label: 'Gear chart',    dot: '#38bdf8' },
                                  { key: 'throttle',  label: 'Throttle chart',dot: '#4ade80' },
                                  { key: 'brake',     label: 'Brake chart',   dot: '#f87171' },
                                ] as { key: keyof typeof visiblePanels; label: string; dot: string }[]).map(({ key, label, dot }, i, arr) => (
                                  <label key={key}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 10,
                                      padding: '8px 14px',
                                      borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={visiblePanels[key]}
                                      onChange={() => togglePanel(key)}
                                      style={{ accentColor: dot, width: 14, height: 14 }}
                                    />
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
                                    <span style={{ color: '#e5e7eb', fontSize: 12 }}>{label}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Telemetry overlay at bottom of fullscreen map */}
                      {inFullscreen && (
                        <div style={{
                          position: 'absolute',
                          bottom: 62,
                          left: 16,
                          width: 'min(600px, 46vw)',
                          zIndex: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}>
                          {visiblePanels.tc && layout.channels.tc && layout.channels.tc.length > 1 && (
                            <TelemetryChart
                              lapDist={layout.lap_dist}
                              values={layout.channels.tc}
                              maxVal={1}
                              lineColor="#f97316"
                              fillColor="#f97316"
                              binaryBars
                              label="TC"
                              labelColor="#f97316"
                              badge={currentTcLevel != null ? (
                                <span style={{ color: '#f97316', fontFamily: 'monospace', fontWeight: 700, fontSize: 11, background: 'rgba(249,115,22,0.15)', borderRadius: 4, padding: '1px 6px', border: '1px solid rgba(249,115,22,0.3)' }}>
                                  TC {currentTcLevel}
                                </span>
                              ) : undefined}
                              ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                              ghostVals={compareWithBest ? ghostTelemetry?.channels.tc : undefined}
                              ghostColor="#facc15"
                              showGhostLegend={compareWithBest && !!ghostTelemetry?.channels.tc}
                              progress={playProgress}
                              inFullscreen
                              onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                            />
                          )}
                          {visiblePanels.abs && layout.channels.abs && layout.channels.abs.length > 1 && (
                            <TelemetryChart
                              lapDist={layout.lap_dist}
                              values={layout.channels.abs}
                              maxVal={1}
                              lineColor="#818cf8"
                              fillColor="#818cf8"
                              binaryBars
                              label="ABS"
                              labelColor="#818cf8"
                              ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                              ghostVals={compareWithBest ? ghostTelemetry?.channels.abs : undefined}
                              ghostColor="#facc15"
                              showGhostLegend={compareWithBest && !!ghostTelemetry?.channels.abs}
                              progress={playProgress}
                              inFullscreen
                              onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                            />
                          )}
                          {visiblePanels.gear && layout.channels.gear && layout.channels.gear.length > 1 && (
                            <TelemetryChart
                              lapDist={layout.lap_dist}
                              values={layout.channels.gear.map(v => v ?? 0)}
                              maxVal={8}
                              lineColor="#38bdf8"
                              fillColor="#0ea5e9"
                              label="GEAR"
                              labelColor="#38bdf8"
                              ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                              ghostVals={compareWithBest ? ghostTelemetry?.channels.gear?.map(v => v ?? 0) : undefined}
                              ghostColor="#facc15"
                              showGhostLegend={compareWithBest && !!ghostTelemetry?.channels.gear}
                              progress={playProgress}
                              inFullscreen
                              onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                            />
                          )}
                          {visiblePanels.throttle && <TelemetryChart
                            lapDist={layout.lap_dist}
                            values={layout.channels.throttle ?? []}
                            lineColor="#4ade80"
                            fillColor="#22c55e"
                            label="THR"
                            labelColor="#4ade80"
                            ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                            ghostVals={compareWithBest ? ghostTelemetry?.channels.throttle : undefined}
                            ghostColor="#facc15"
                            showGhostLegend={compareWithBest}
                            progress={playProgress}
                            inFullscreen
                            onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                          />}
                          {visiblePanels.brake && <TelemetryChart
                            lapDist={layout.lap_dist}
                            values={layout.channels.brake ?? []}
                            lineColor="#f87171"
                            fillColor="#ef4444"
                            label="BRK"
                            labelColor="#f87171"
                            ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                            ghostVals={compareWithBest ? ghostTelemetry?.channels.brake : undefined}
                            ghostColor="#fb923c"
                            showGhostLegend={compareWithBest}
                            progress={playProgress}
                            inFullscreen
                            onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                          />}
                        </div>
                      )}
                      {/* Right overlay column: delta + suspension cards — single flex column, uniform gap */}
                      {(visiblePanels.delta || visiblePanels.slipAngle || visiblePanels.rearView || visiblePanels.rightSusp || visiblePanels.leftSusp) && (() => {
                        // Suspension values — only needed in fullscreen
                        let beta = 0, gLat = 0, gLon = 0
                        let suspRL: number | undefined, suspRR: number | undefined, suspFL: number | undefined, suspFR: number | undefined
                        let rear3rd: number | undefined, gVert: number | undefined
                        let rhRL: number | undefined, rhRR: number | undefined, rhFL: number | undefined, rhFR: number | undefined
                        // Ghost suspension values
                        let gBeta: number | undefined, gGLat: number | undefined, gGLon: number | undefined
                        let gSuspRL: number | undefined, gSuspRR: number | undefined, gSuspFL: number | undefined, gSuspFR: number | undefined
                        let gRear3rd: number | undefined, gGVert: number | undefined
                        let gRhRL: number | undefined, gRhRR: number | undefined, gRhFL: number | undefined, gRhFR: number | undefined
                        if (inFullscreen) {
                          const sa = layout.channels.slip_angle_deg
                          if (sa && sa.length > 1) {
                            const idx = Math.round(playProgress * (sa.length - 1))
                            const clampIdx = Math.max(0, Math.min(idx, sa.length - 1))
                            beta = sa[clampIdx] ?? 0
                            const gl = layout.channels.g_lat
                            gLat = gl ? (gl[clampIdx] ?? 0) : 0
                            suspRL = layout.channels.susp_pos_rl?.[clampIdx] ?? undefined
                            suspRR = layout.channels.susp_pos_rr?.[clampIdx] ?? undefined
                            suspFL = layout.channels.susp_pos_fl?.[clampIdx] ?? undefined
                            suspFR = layout.channels.susp_pos_fr?.[clampIdx] ?? undefined
                            rear3rd = layout.channels.rear_3rd_defl?.[clampIdx] ?? undefined
                            gVert = layout.channels.g_vert?.[clampIdx] ?? undefined
                            rhRL = layout.channels.ride_height_rl?.[clampIdx] ?? undefined
                            rhRR = layout.channels.ride_height_rr?.[clampIdx] ?? undefined
                            rhFL = layout.channels.ride_height_fl?.[clampIdx] ?? undefined
                            rhFR = layout.channels.ride_height_fr?.[clampIdx] ?? undefined
                            gLon = layout.channels.g_lon?.[clampIdx] ?? 0
                          }
                          // Ghost values at same relative playProgress
                          if (compareWithBest && ghostTelemetry) {
                            const gt = ghostTelemetry.channels
                            const gSa = gt.slip_angle_deg
                            if (gSa && gSa.length > 1) {
                              const gIdx = Math.max(0, Math.min(Math.round(playProgress * (gSa.length - 1)), gSa.length - 1))
                              gBeta = (gSa[gIdx] as number | null) ?? undefined
                              const gGl = gt.g_lat
                              gGLat = gGl ? ((gGl[gIdx] as number | null) ?? undefined) : undefined
                              gSuspRL = (gt.susp_pos_rl?.[gIdx] as number | null) ?? undefined
                              gSuspRR = (gt.susp_pos_rr?.[gIdx] as number | null) ?? undefined
                              gSuspFL = (gt.susp_pos_fl?.[gIdx] as number | null) ?? undefined
                              gSuspFR = (gt.susp_pos_fr?.[gIdx] as number | null) ?? undefined
                              gRear3rd = (gt.rear_3rd_defl?.[gIdx] as number | null) ?? undefined
                              gGVert = (gt.g_vert?.[gIdx] as number | null) ?? undefined
                              gRhRL = (gt.ride_height_rl?.[gIdx] as number | null) ?? undefined
                              gRhRR = (gt.ride_height_rr?.[gIdx] as number | null) ?? undefined
                              gRhFL = (gt.ride_height_fl?.[gIdx] as number | null) ?? undefined
                              gRhFR = (gt.ride_height_fr?.[gIdx] as number | null) ?? undefined
                              gGLon = (gt.g_lon?.[gIdx] as number | null) ?? undefined
                            }
                          }
                        }
                        // Delta display values
                        const sign = (smoothedDeltaMs ?? 0) > 0 ? '+' : ''
                        const color = (smoothedDeltaMs ?? 0) > 50 ? '#f87171' : (smoothedDeltaMs ?? 0) < -50 ? '#4ade80' : '#facc15'
                        const secs = (smoothedDeltaMs ?? 0) / 1000
                        const absSecs = Math.abs(secs)
                        const intPart = (sign === '+' ? '+' : (secs < 0 ? '-' : '')) + Math.floor(absSecs).toString()
                        const tenths = Math.floor((absSecs * 10) % 10)
                        const hundredths = Math.floor((absSecs * 100) % 10)
                        const thousandths = Math.floor((absSecs * 1000) % 10)
                        return (
                          <div style={{ position: 'absolute', top: 0, right: 16, zIndex: 20, width: 165, display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {visiblePanels.delta && smoothedDeltaMs != null && (
                              <div style={{
                                background: 'rgba(8,12,22,0.82)', backdropFilter: 'blur(6px)',
                                borderRadius: 10, padding: '4px 12px 5px', textAlign: 'center',
                                border: '1px solid rgba(255,255,255,0.06)', boxSizing: 'border-box',
                                marginTop: 8,
                              }}>
                                <p style={{ color: '#6b7280', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0, marginBottom: 1 }}>Δ ghost</p>
                                <p style={{ color, fontFamily: 'monospace', fontWeight: 700, margin: 0, lineHeight: 1 }}>
                                  <span style={{ fontSize: 30 }}>{intPart}.{tenths}</span>
                                  <span style={{ fontSize: 18, opacity: 0.7 }}>{hundredths}{thousandths}</span>
                                </p>
                              </div>
                            )}
                            {inFullscreen && visiblePanels.slipAngle && layout.channels.slip_angle_deg && layout.channels.slip_angle_deg.length > 1 && <SlipAngleCar beta={beta} ghostBeta={gBeta} />}
                            {inFullscreen && visiblePanels.rearView && <RearViewCar gLat={gLat} gVert={gVert} suspRL={suspRL} suspRR={suspRR} rideHeightRL={rhRL} rideHeightRR={rhRR} rear3rdDefl={rear3rd} ghostGLat={gGLat} ghostSuspRL={gSuspRL} ghostSuspRR={gSuspRR} ghostRideHeightRL={gRhRL} ghostRideHeightRR={gRhRR} ghostRear3rdDefl={gRear3rd} ghostGVert={gGVert} />}
                            {inFullscreen && visiblePanels.rightSusp && <RightView gLon={gLon} gVert={gVert} suspF={suspFR} suspR={suspRR} rideHeightF={rhFR} rideHeightR={rhRR} ghostGLon={gGLon} ghostGVert={gGVert} ghostSuspF={gSuspFR} ghostSuspR={gSuspRR} ghostRideHeightF={gRhFR} ghostRideHeightR={gRhRR} />}
                            {inFullscreen && visiblePanels.leftSusp && <LeftView gLon={gLon} gVert={gVert} suspF={suspFL} suspR={suspRL} rideHeightF={rhFL} rideHeightR={rhRL} ghostGLon={gGLon} ghostGVert={gGVert} ghostSuspF={gSuspFL} ghostSuspR={gSuspRL} ghostRideHeightF={gRhFL} ghostRideHeightR={gRhRL} />}
                          </div>
                        )
                      })()}
                      {/* Frame-by-frame controls — bottom center, only in fullscreen */}
                      {inFullscreen && (
                        <div style={{
                          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
                          zIndex: 60, display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <button
                            onClick={() => trackMapRef.current?.stepFrame(-1)}
                            style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)',
                              color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            title={t.prevFrame}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="19,5 9,12 19,19" /><rect x="5" y="5" width="3" height="14" />
                            </svg>
                          </button>
                          <button
                            onClick={() => trackMapRef.current?.togglePlay()}
                            style={{
                              width: 44, height: 44, borderRadius: '50%',
                              background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.2)',
                              color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            title={t.playPause}
                          >
                            {playing
                              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                            }
                          </button>
                          <button
                            onClick={() => trackMapRef.current?.stepFrame(1)}
                            style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.15)',
                              color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            title={t.nextFrame}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5,5 15,12 5,19" /><rect x="16" y="5" width="3" height="14" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-lmu-secondary rounded-lg p-5 space-y-1">
                    <TelemetryChart
                      lapDist={layout.lap_dist}
                      values={layout.channels.throttle ?? []}
                      lineColor="#4ade80"
                      fillColor="#22c55e"
                      label="THR"
                      labelColor="#4ade80"
                      ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                      ghostVals={compareWithBest ? ghostTelemetry?.channels.throttle : undefined}
                      ghostColor="#facc15"
                      showGhostLegend={compareWithBest}
                      progress={playProgress}
                      onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                    />
                    <TelemetryChart
                      lapDist={layout.lap_dist}
                      values={layout.channels.brake ?? []}
                      lineColor="#f87171"
                      fillColor="#ef4444"
                      label="BRK"
                      labelColor="#f87171"
                      ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                      ghostVals={compareWithBest ? ghostTelemetry?.channels.brake : undefined}
                      ghostColor="#fb923c"
                      showGhostLegend={compareWithBest}
                      progress={playProgress}
                      onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                    />
                    {layout.channels.tc && layout.channels.tc.length > 1 && (
                      <TelemetryChart
                        lapDist={layout.lap_dist}
                        values={layout.channels.tc}
                        maxVal={1}
                        lineColor="#f97316"
                        fillColor="#f97316"
                        binaryBars
                        label="TC"
                        labelColor="#f97316"
                        badge={currentTcLevel != null ? (
                          <span style={{ color: '#f97316', fontFamily: 'monospace', fontWeight: 700, fontSize: 11, background: 'rgba(249,115,22,0.15)', borderRadius: 4, padding: '1px 6px', border: '1px solid rgba(249,115,22,0.3)' }}>
                            TC {currentTcLevel}
                          </span>
                        ) : undefined}
                        ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                        ghostVals={compareWithBest ? ghostTelemetry?.channels.tc : undefined}
                        ghostColor="#facc15"
                        showGhostLegend={compareWithBest && !!ghostTelemetry?.channels.tc}
                        progress={playProgress}
                        onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                      />
                    )}
                    {layout.channels.abs && layout.channels.abs.length > 1 && (
                      <TelemetryChart
                        lapDist={layout.lap_dist}
                        values={layout.channels.abs}
                        maxVal={1}
                        lineColor="#818cf8"
                        fillColor="#818cf8"
                        binaryBars
                        label="ABS"
                        labelColor="#818cf8"
                        ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                        ghostVals={compareWithBest ? ghostTelemetry?.channels.abs : undefined}
                        ghostColor="#facc15"
                        showGhostLegend={compareWithBest && !!ghostTelemetry?.channels.abs}
                        progress={playProgress}
                        onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                      />
                    )}
                    {layout.channels.gear && layout.channels.gear.length > 1 && (
                      <TelemetryChart
                        lapDist={layout.lap_dist}
                        values={layout.channels.gear.map(v => v ?? 0)}
                        maxVal={8}
                        lineColor="#38bdf8"
                        fillColor="#0ea5e9"
                        label="GEAR"
                        labelColor="#38bdf8"
                        ghostDist={compareWithBest ? ghostTelemetry?.lap_dist : undefined}
                        ghostVals={compareWithBest ? ghostTelemetry?.channels.gear?.map(v => v ?? 0) : undefined}
                        ghostColor="#facc15"
                        showGhostLegend={compareWithBest && !!ghostTelemetry?.channels.gear}
                        progress={playProgress}
                        onSeek={(p) => { trackMapRef.current?.seek(p); setPlayProgress(p) }}
                      />
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="bg-lmu-secondary rounded-lg flex items-center justify-center h-64">
                <Spinner />
              </div>
            )}
          </div>

          {/* ── Right panel: stats + legend (map view only) ── */}
          {layout && view === 'map' && (
            <aside className="w-44 shrink-0 space-y-3">
              {/* Lap stats */}
              <div className="bg-lmu-secondary rounded-lg p-3 space-y-3 border border-lmu-highlight/30">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">{t.time}</p>
                  <p className="font-mono text-lmu-accent font-bold text-lg leading-tight">{fmtMs(layout.lap_time_ms)}</p>
                </div>
                {layout.channels.speed_kmh && layout.channels.speed_kmh.length > 0 && (() => {
                  const spd = layout.channels.speed_kmh.filter(v => v != null && v > 0)
                  const top = Math.max(...spd)
                  const avg = spd.reduce((a, b) => a + b, 0) / spd.length
                  const dist = layout.lap_dist[layout.lap_dist.length - 1] ?? 0
                  return (
                    <>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">{t.maxSpeed}</p>
                        <p className="font-mono text-white font-semibold">{top.toFixed(0)} <span className="text-gray-500 text-xs">km/h</span></p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">{t.avgSpeed}</p>
                        <p className="font-mono text-white font-semibold">{avg.toFixed(0)} <span className="text-gray-500 text-xs">km/h</span></p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">{t.distance}</p>
                        <p className="font-mono text-white font-semibold">{(dist / 1000).toFixed(3)} <span className="text-gray-500 text-xs">km</span></p>
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Color legend */}
              <div className="bg-lmu-secondary rounded-lg p-3 border border-lmu-highlight/30 space-y-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">{t.line}</p>
                {[
                  { color: '#22c55e', label: t.acceleration },
                  { color: '#86efac', label: t.partial },
                  { color: '#ef4444', label: t.braking },
                  { color: '#475569', label: t.coasting },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-3 h-1.5 rounded-sm shrink-0" style={{ background: color }} />
                    <span className="text-xs text-gray-400">{label}</span>
                  </div>
                ))}
              </div>

              {/* Save lap button */}
              {circuitNotApproved && (
                <div className="flex items-center gap-1.5 bg-yellow-900/40 border border-yellow-500/40
                                text-yellow-400 text-[11px] px-2.5 py-1.5 rounded-lg">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {t.unapprovedCircuit}
                </div>
              )}
              <button
                onClick={saveLap}
                disabled={saving || !layout?.valid || circuitNotApproved}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed
                           text-white font-semibold text-sm px-3 py-2.5 rounded-lg transition-colors
                           flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Spinner /> {t.saving}</>
                ) : (
                  <><SaveIcon /> {t.saveLap}</>
                )}
              </button>

              {/* Saved lap indicator removed — now shown as toast */}

            </aside>
          )}
        </div>
      ) : (
        !uploading && (
          <section className="bg-lmu-secondary rounded-lg p-6">
            <p className="text-gray-400 text-sm">
              {t.emptyState}
            </p>
          </section>
        )
      )}
    </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-3
                        bg-green-900/90 border border-green-500/50 text-green-300
                        px-4 py-3 rounded-xl shadow-xl backdrop-blur-sm
                        animate-[fadeInUp_0.25s_ease-out]">
          <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">{toast}</span>
          <button onClick={() => setToast(null)} className="ml-1 text-green-500 hover:text-green-200 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  )
}


function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}
