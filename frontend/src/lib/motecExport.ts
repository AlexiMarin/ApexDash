/**
 * Client-side MoTeC i2 CSV export.
 *
 * Generates a CSV in the MoTeC i2 "Logged Data" import format directly
 * from the LayoutData already loaded in memory by DuckDB-WASM.
 *
 * MoTeC i2 CSV format:
 *   Rows 1-9: metadata headers (Format, Venue, Vehicle, ...)
 *   Row 10:   blank
 *   Row 11:   channel names
 *   Row 12:   channel units
 *   Rows 13+: data (one row per sample)
 *
 * Import via: MoTeC i2 → File → Import → CSV
 */

import type { LayoutData, LapInfo } from '../types/telemetry'

interface ColumnDef {
  name: string
  unit: string
  getValue: (ch: LayoutData['channels'], dist: number[], i: number) => number | null
}

const COLUMNS: ColumnDef[] = [
  {
    name: 'Time',
    unit: 's',
    // 10 Hz → i * 0.1 s
    getValue: (_ch, _dist, i) => Math.round(i * 100) / 1000,
  },
  {
    name: 'Lap_Distance',
    unit: 'm',
    getValue: (_ch, dist, i) => dist[i] ?? null,
  },
  {
    name: 'Speed',
    unit: 'km/h',
    getValue: (ch, _dist, i) => ch.speed_kmh?.[i] ?? null,
  },
  {
    name: 'Throttle',
    unit: '%',
    getValue: (ch, _dist, i) => ch.throttle?.[i] ?? null,
  },
  {
    name: 'Brake',
    unit: '%',
    getValue: (ch, _dist, i) => ch.brake?.[i] ?? null,
  },
  {
    name: 'Steering',
    unit: 'deg',
    getValue: (ch, _dist, i) => ch.steering?.[i] ?? null,
  },
  {
    name: 'Gear',
    unit: '',
    getValue: (ch, _dist, i) => ch.gear?.[i] ?? null,
  },
  {
    name: 'G_Lat',
    unit: 'g',
    getValue: (ch, _dist, i) => ch.g_lat?.[i] ?? null,
  },
  {
    name: 'G_Lon',
    unit: 'g',
    getValue: (ch, _dist, i) => ch.g_lon?.[i] ?? null,
  },
  {
    name: 'G_Vert',
    unit: 'g',
    getValue: (ch, _dist, i) => ch.g_vert?.[i] ?? null,
  },
  {
    name: 'GPS_Latitude',
    unit: 'deg',
    getValue: (ch, _dist, i) => ch.lat?.[i] ?? null,
  },
  {
    name: 'GPS_Longitude',
    unit: 'deg',
    getValue: (ch, _dist, i) => ch.lon?.[i] ?? null,
  },
  {
    name: 'Slip_Angle',
    unit: 'deg',
    getValue: (ch, _dist, i) => ch.slip_angle_deg?.[i] ?? null,
  },
  {
    name: 'TC',
    unit: '',
    getValue: (ch, _dist, i) => ch.tc?.[i] ?? null,
  },
  {
    name: 'ABS',
    unit: '',
    getValue: (ch, _dist, i) => ch.abs?.[i] ?? null,
  },
  {
    name: 'Susp_FL',
    unit: 'norm',
    getValue: (ch, _dist, i) => ch.susp_pos_fl?.[i] ?? null,
  },
  {
    name: 'Susp_FR',
    unit: 'norm',
    getValue: (ch, _dist, i) => ch.susp_pos_fr?.[i] ?? null,
  },
  {
    name: 'Susp_RL',
    unit: 'norm',
    getValue: (ch, _dist, i) => ch.susp_pos_rl?.[i] ?? null,
  },
  {
    name: 'Susp_RR',
    unit: 'norm',
    getValue: (ch, _dist, i) => ch.susp_pos_rr?.[i] ?? null,
  },
  {
    name: 'RideHeight_FL',
    unit: 'm',
    getValue: (ch, _dist, i) => ch.ride_height_fl?.[i] ?? null,
  },
  {
    name: 'RideHeight_FR',
    unit: 'm',
    getValue: (ch, _dist, i) => ch.ride_height_fr?.[i] ?? null,
  },
  {
    name: 'RideHeight_RL',
    unit: 'm',
    getValue: (ch, _dist, i) => ch.ride_height_rl?.[i] ?? null,
  },
  {
    name: 'RideHeight_RR',
    unit: 'm',
    getValue: (ch, _dist, i) => ch.ride_height_rr?.[i] ?? null,
  },
]

function formatVal(v: number | null): string {
  if (v === null || Number.isNaN(v)) return ''
  return String(Math.round(v * 10000) / 10000)
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 8)
}

/**
 * Generate a MoTeC i2-compatible CSV string from LayoutData.
 *
 * @param layout  - LayoutData loaded by loadLapLayout()
 * @param lapInfo - lap metadata (number, time)
 * @param track   - circuit/venue name
 * @param recordedAt - ISO string of session date (optional)
 * @returns CSV string ready for download
 */
export function exportLapToMoTeCCSV(
  layout: LayoutData,
  lapInfo: LapInfo,
  track: string,
  recordedAt?: string | null,
): string {
  const { channels, lap_dist } = layout
  const nSamples = lap_dist.length

  const sessionDate = recordedAt ? new Date(recordedAt) : new Date()

  const rows: string[] = []

  // ── MoTeC i2 header block ────────────────────────────────
  rows.push(`Format,MoTeC CSV Export`)
  rows.push(`Venue,${track}`)
  rows.push(`Vehicle,LMU`)
  rows.push(`Driver,`)
  rows.push(`Device,ApexDash`)
  rows.push(`Comment,Lap ${lapInfo.lap_number}`)
  rows.push(`Log Date,${formatDate(sessionDate)}`)
  rows.push(`Log Time,${formatTime(sessionDate)}`)
  rows.push(`Sample Rate,10`)
  rows.push(``)  // blank separator

  // ── Channel names & units ────────────────────────────────
  rows.push(COLUMNS.map((c) => c.name).join(','))
  rows.push(COLUMNS.map((c) => c.unit).join(','))

  // ── Data rows ────────────────────────────────────────────
  for (let i = 0; i < nSamples; i++) {
    const row = COLUMNS.map((col) => formatVal(col.getValue(channels, lap_dist, i)))
    rows.push(row.join(','))
  }

  return rows.join('\r\n')
}

/**
 * Trigger a browser file download of the CSV.
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
