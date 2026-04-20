import { useEffect, useState } from 'react'
import api from '../lib/api'
import { fmtMs } from '../types/telemetry'
import MiniTrackMap from './MiniTrackMap'
import { useT } from '../contexts/LanguageContext'

interface Circuit {
  name: string
  layout: string
  short_name: string | null
  flag: string | null
  country: string | null
  best_lap_ms: number | null
  sector1_ms: number | null
  sector2_ms: number | null
  sector3_ms: number | null
}

interface TrackLayout {
  lat: number[]
  lon: number[]
}

interface Props {
  onUpload: () => void
  uploading: boolean
  onSelectCircuit?: (name: string) => void
}

export default function CircuitsGrid({ onUpload, uploading, onSelectCircuit }: Props) {
  const t = useT()
  const [circuits, setCircuits] = useState<Circuit[]>([])
  const [loading, setLoading] = useState(true)
  const [layouts, setLayouts] = useState<Record<string, TrackLayout>>({})

  useEffect(() => {
    api
      .get<Circuit[]>(`/api/circuits`)
      .then(r => {
        setCircuits(r.data)
        // Fetch layout for circuits that have a saved lap
        r.data
          .filter(c => c.best_lap_ms != null)
          .forEach(c => {
            api
              .get<TrackLayout>(`/api/circuits/${encodeURIComponent(c.layout)}/layout`)
              .then(lr => setLayouts(prev => ({ ...prev, [c.layout]: lr.data })))
              .catch(() => {/* no layout available yet */})
          })
      })
      .catch(() => setCircuits([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-8">
      {/* Hero title */}
      <div className="text-center space-y-2 pt-4">
        <h2 className="text-4xl font-extrabold tracking-tight">
          {t.chooseCircuit}
        </h2>
        <p className="text-gray-400 text-sm">
          {t.chooseCircuitDesc}
        </p>
      </div>

      {/* Circuit cards */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {circuits.map(c => {
            const hasBest = c.best_lap_ms != null
            const layout = layouts[c.layout]
            return (
              <div
                key={c.layout}
                onClick={hasBest && onSelectCircuit ? () => onSelectCircuit(c.layout) : undefined}
                className={`relative rounded-2xl overflow-hidden border transition-all duration-200
                  ${hasBest
                    ? 'border-lmu-accent/50 bg-gradient-to-br from-lmu-secondary to-lmu-highlight/40 shadow-lg shadow-lmu-accent/10 cursor-pointer hover:border-lmu-accent hover:shadow-lmu-accent/25 hover:scale-[1.02]'
                    : 'border-lmu-highlight/40 bg-lmu-secondary'}
                `}
              >
                {/* Top accent stripe */}
                <div className={`h-1 w-full ${hasBest ? 'bg-lmu-accent' : 'bg-lmu-highlight'}`} />

                {/* Mini track map background */}
                {layout && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none select-none">
                    <MiniTrackMap lat={layout.lat} lon={layout.lon} width={260} height={160} />
                  </div>
                )}

                <div className="relative p-5 space-y-4">
                  {/* Circuit name + flag */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold leading-tight">{c.short_name ?? c.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.flag || c.country ? `${c.flag ?? ''} ${c.country ?? ''}`.trim() : ''}
                      </p>
                      <p className="text-[11px] font-mono text-gray-500 mt-1 break-all">{c.layout}</p>
                    </div>
                    {hasBest && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest
                                       bg-lmu-accent/20 text-lmu-accent px-2 py-0.5 rounded-full border border-lmu-accent/40">
                        Best set
                      </span>
                    )}
                  </div>

                  {/* Best lap display */}
                  {hasBest ? (
                    <div className="space-y-2">
                      {/* Mini track map */}
                      {layout && (
                        <div className="flex justify-center bg-black/30 rounded-xl py-2">
                          <MiniTrackMap lat={layout.lat} lon={layout.lon} width={200} height={110} />
                        </div>
                      )}
                      <div className="bg-black/30 rounded-xl px-4 py-3 text-center">
                        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Best Lap</p>
                        <p className="text-3xl font-mono font-extrabold text-lmu-accent tabular-nums">
                          {fmtMs(c.best_lap_ms)}
                        </p>
                      </div>
                      {/* Sector times */}
                      {(c.sector1_ms || c.sector2_ms || c.sector3_ms) && (
                        <div className="grid grid-cols-3 gap-1 text-center">
                          {([c.sector1_ms, c.sector2_ms, c.sector3_ms] as (number | null)[]).map((s, i) => (
                            <div key={i} className="bg-black/20 rounded-lg py-1.5">
                              <p className="text-[9px] uppercase tracking-widest text-gray-500">S{i + 1}</p>
                              <p className="text-xs font-mono font-semibold text-gray-300 tabular-nums">
                                {s != null ? `${(s / 1000).toFixed(3)}` : '–'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-black/20 rounded-xl px-4 py-4 text-center">
                      <p className="text-gray-500 text-sm">{t.noLapRecorded}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Upload CTA */}
      <div className="flex justify-center pb-4">
        <button
          disabled={uploading}
          onClick={onUpload}
          className="flex items-center gap-2 bg-lmu-accent hover:bg-yellow-400 disabled:opacity-50
                     text-black font-semibold px-6 py-3 rounded-xl transition-colors text-base shadow-lg shadow-lmu-accent/20"
        >
          {uploading ? (
            <><Spinner /><span>{t.uploading}</span></>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>{t.loadSession}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-5 h-5 text-lmu-accent" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
}
