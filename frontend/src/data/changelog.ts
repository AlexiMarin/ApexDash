// ──────────────────────────────────────────────────────────────
//  changelog.ts
//  Agrega entradas aquí para que aparezcan en la sección Novedades.
//  Orden: más reciente primero.
// ──────────────────────────────────────────────────────────────

export type ChangeType = 'new' | 'improved' | 'fix' | 'removed'

export interface ChangeItem {
  type: ChangeType
  es: string
  en: string
}

export interface ChangelogEntry {
  version: string
  date: string          // formato: YYYY-MM-DD
  title: { es: string; en: string }
  items: ChangeItem[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-04-19',
    title: {
      es: 'Lanzamiento inicial 🎉',
      en: 'Initial release 🎉',
    },
    items: [
      {
        type: 'new',
        es: 'Dashboard en vivo con mapa de trazado del circuito',
        en: 'Live dashboard with circuit track map',
      },
      {
        type: 'new',
        es: 'Carga de archivos .duckdb procesados directamente en el navegador',
        en: 'Upload .duckdb files processed directly in the browser',
      },
      {
        type: 'new',
        es: 'Telemetría: velocidad, RPM, temperatura de neumáticos, frenos y presiones',
        en: 'Telemetry: speed, RPM, tyre temperature, brakes and pressures',
      },
      {
        type: 'new',
        es: 'Guardado de vuelta rápida por circuito',
        en: 'Save fastest lap per circuit',
      },
      {
        type: 'new',
        es: 'Soporte para inglés y español',
        en: 'English and Spanish support',
      },
    ],
  },
]
