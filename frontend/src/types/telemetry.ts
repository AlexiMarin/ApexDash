export interface LapInfo {
  lap_number: number
  lap_time_ms: number | null
  valid: boolean
}

export interface LayoutData {
  lap_dist: number[]
  lap_time_ms: number | null
  valid: boolean
  sector_dists?: number[]
  tc_level?: number | null
  channels: {
    lat: number[]
    lon: number[]
    speed_kmh: number[]
    throttle: number[]
    brake: number[]
    g_lat?: number[]
    path_lateral: number[]
    track_edge: number[]
    slip_angle_deg?: number[]
    slip_ratio_fl?: number[]
    slip_ratio_fr?: number[]
    slip_ratio_rl?: number[]
    slip_ratio_rr?: number[]
    tc?: number[]
    tc_level?: number[]
    susp_pos_fl?: number[]
    susp_pos_fr?: number[]
    susp_pos_rl?: number[]
    susp_pos_rr?: number[]
    ride_height_rl?: number[]
    ride_height_rr?: number[]
    ride_height_fl?: number[]
    ride_height_fr?: number[]
    rear_3rd_defl?: number[]
    g_vert?: number[]
    g_lon?: number[]
    steering?: number[]
    gear?: (number | null)[]
    abs?: number[]
    abs_level?: number[]
  }
}

export function fmtMs(ms: number | null): string {
  if (ms == null) return '–'
  const m = Math.floor(ms / 60000)
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0')
  return `${m}:${s}`
}
