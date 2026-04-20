import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'es' | 'en'

interface LanguageContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  toggle: () => void
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'es',
  setLang: () => {},
  toggle: () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('es')
  const toggle = () => setLang(l => (l === 'es' ? 'en' : 'es'))
  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}

// ── Dashboard translations ───────────────────────────────────

const dashboard = {
  es: {
    // Layout nav
    liveView: 'Live View',
    sessions: 'Sesiones',
    compareLaps: 'Comparar Vueltas',
    footerLove: 'hecho con amor por Alexi',

    // CircuitsGrid
    chooseCircuit: 'Elige tu circuito',
    chooseCircuitDesc: 'Carga un archivo .duckdb de una sesión para analizar y guardar tu vuelta rápida.',
    noLapRecorded: 'Sin vuelta registrada',
    uploading: 'Subiendo…',
    loadSession: 'Cargar sesión (.duckdb)',

    // ErrorBoundary
    somethingWrong: 'Algo salió mal',
    unexpectedError: 'Ocurrió un error inesperado. Por favor recarga la página.',
    retry: 'Reintentar',
    reloadPage: 'Recargar página',

    // TelemetryPanel
    loadingTelemetry: 'Cargando telemetría…',
    telemetryError: 'No se pudo cargar la telemetría. Intenta de nuevo.',
    speed: 'Velocidad',
    rpmGear: 'RPM / Marcha',
    rubberTemp: 'Temp. goma (superficie)',
    carcassTemp: 'Temp. carcasa',
    rimTemp: 'Temp. llanta (rim)',
    centreTemp: 'Temp. sup. centro',
    leftTemp: 'Temp. sup. izquierda',
    rightTemp: 'Temp. sup. derecha',
    tyrePressure: 'Presión neumáticos',
    tyreWear: 'Desgaste neumáticos',
    brakeTemp: 'Temperatura frenos',

    // TelemetryChart
    splitGhost: 'Separar Ghost / Vuelta',
    overlapGhost: 'Solapar Ghost / Vuelta',

    // TrackMap
    restart: 'Reiniciar',
    exitFullscreen: 'Salir del fullscreen (Esc)',
    repeat: 'Repetir',
    fullscreen: 'Pantalla completa',

    // Dashboard
    savedLapToast: 'Vuelta guardada',
    saveLapError: 'No se pudo guardar la vuelta. Intenta de nuevo.',
    loadLayoutError: 'No se pudo cargar el trazado. Intenta de nuevo.',
    loadSavedLapError: 'No se pudo cargar la vuelta guardada. Intenta de nuevo.',
    noValidLaps: 'No se encontraron vueltas válidas en el archivo.',
    fileProcessError: 'No se pudo procesar el archivo. Verifica que sea un archivo .duckdb válido.',
    loadingLap: 'Cargando vuelta…',
    motecLimitations: 'Limitaciones del export MoTeC CSV',
    motecGpsNote: 'Las coordenadas GPS exportadas son en formato interno de LMU, no WGS84. El mapa de pista en MoTeC i2 no se mostrará en la ubicación correcta.',
    motecImportNote: 'Importar en MoTeC i2 via File → Import → CSV.',
    compareWithBest: 'Comparar con best lap',
    lap: 'vuelta',
    laps: 'vueltas',
    fileTooLarge: 'El archivo es demasiado grande para procesarse en el navegador. Volvé a subir el archivo e intentá de nuevo.',
    panels: 'Paneles',
    showHidePanels: 'Mostrar/ocultar paneles',
    prevFrame: 'Frame anterior',
    playPause: 'Play / Pausa',
    nextFrame: 'Frame siguiente',
    time: 'Tiempo',
    maxSpeed: 'Vel. máx',
    avgSpeed: 'Vel. media',
    distance: 'Distancia',
    line: 'Línea',
    acceleration: 'Aceleración',
    partial: 'Parcial',
    braking: 'Frenada',
    coasting: 'Costa',
    unapprovedCircuit: 'Circuito no aprobado — sólo vista local',
    saving: 'Guardando...',
    saveLap: 'Guardar vuelta',
    emptyState: 'Carga un archivo .duckdb para ver el layout del circuito.',

    // SessionList
    slSessions: 'Sesiones',
    slImport: 'Importar Sesión',
    slAllCircuits: 'Todos los circuitos',
    slAllCars: 'Todos los coches',
    slDate: 'Fecha',
    slCircuit: 'Circuito',
    slCar: 'Coche',
    slLaps: 'Vueltas',
    slBestTime: 'Mejor Tiempo',
    slActions: 'Acciones',
    slPlaceholder: 'Conectar con backend para cargar sesiones...',

    // SessionDetail
    sdSession: 'Sesión:',
    sdCircuit: 'Circuito',
    sdCar: 'Coche',
    sdDate: 'Fecha',
    sdLapTimes: 'Tiempos por Vuelta',
    sdLap: 'Vuelta',
    sdTime: 'Tiempo',
    sdLapData: 'Datos de vueltas...',
    sdTelemetry: 'Telemetría',
    sdSpeedVsDist: 'Velocidad vs Distancia',
    sdRpmVsDist: 'RPM vs Distancia',
    sdTrackMap: 'Mapa del Circuito',
    sdTrackMapPlaceholder: 'Mapa del circuito con datos de telemetría...',

    // LapComparison
    lcTitle: 'Comparar Vueltas',
    lcSelectLaps: 'Seleccionar Vueltas',
    lcLap1: 'Vuelta 1 (Referencia)',
    lcLap2: 'Vuelta 2 (Comparación)',
    lcSpeed: 'Velocidad',
    lcDeltaAnalysis: 'Análisis de Delta',
    lcDeltaPlaceholder: 'Gráfica de delta acumulado...',
    lcSectorComparison: 'Comparación por Sectores',
    lcLap1Header: 'Vuelta 1',
    lcLap2Header: 'Vuelta 2',
    lcDifference: 'Diferencia',
    lcSelectToCompare: 'Selecciona vueltas para comparar...',
    lcSelectSession: 'Seleccionar sesión...',
    lcSelectLap: 'Seleccionar vuelta...',
    lcChartOf: 'Gráfica de',

    // Novedades
    whatsNew: 'Novedades',
    whatsNewDesc: 'Últimas actualizaciones y mejoras de ApexDash.',
  },
  en: {
    liveView: 'Live View',
    sessions: 'Sessions',
    compareLaps: 'Compare Laps',
    footerLove: 'made with love by Alexi',

    chooseCircuit: 'Choose your circuit',
    chooseCircuitDesc: 'Load a .duckdb session file to analyze and save your fastest lap.',
    noLapRecorded: 'No lap recorded',
    uploading: 'Uploading…',
    loadSession: 'Load session (.duckdb)',

    somethingWrong: 'Something went wrong',
    unexpectedError: 'An unexpected error occurred. Please reload the page.',
    retry: 'Retry',
    reloadPage: 'Reload page',

    loadingTelemetry: 'Loading telemetry…',
    telemetryError: 'Could not load telemetry. Try again.',
    speed: 'Speed',
    rpmGear: 'RPM / Gear',
    rubberTemp: 'Rubber temp (surface)',
    carcassTemp: 'Carcass temp',
    rimTemp: 'Rim temp',
    centreTemp: 'Surface temp centre',
    leftTemp: 'Surface temp left',
    rightTemp: 'Surface temp right',
    tyrePressure: 'Tyre pressure',
    tyreWear: 'Tyre wear',
    brakeTemp: 'Brake temperature',

    splitGhost: 'Split Ghost / Lap',
    overlapGhost: 'Overlap Ghost / Lap',

    restart: 'Restart',
    exitFullscreen: 'Exit fullscreen (Esc)',
    repeat: 'Repeat',
    fullscreen: 'Fullscreen',

    savedLapToast: 'Lap saved',
    saveLapError: 'Could not save lap. Try again.',
    loadLayoutError: 'Could not load track layout. Try again.',
    loadSavedLapError: 'Could not load saved lap. Try again.',
    noValidLaps: 'No valid laps found in the file.',
    fileProcessError: 'Could not process the file. Make sure it is a valid .duckdb file.',
    loadingLap: 'Loading lap…',
    motecLimitations: 'MoTeC CSV export limitations',
    motecGpsNote: 'Exported GPS coordinates are in LMU internal format, not WGS84. The track map in MoTeC i2 will not show in the correct location.',
    motecImportNote: 'Import in MoTeC i2 via File → Import → CSV.',
    compareWithBest: 'Compare with best lap',
    lap: 'lap',
    laps: 'laps',
    fileTooLarge: 'The file is too large to process in the browser. Please re-upload and try again.',
    panels: 'Panels',
    showHidePanels: 'Show/hide panels',
    prevFrame: 'Previous frame',
    playPause: 'Play / Pause',
    nextFrame: 'Next frame',
    time: 'Time',
    maxSpeed: 'Max speed',
    avgSpeed: 'Avg speed',
    distance: 'Distance',
    line: 'Line',
    acceleration: 'Acceleration',
    partial: 'Partial',
    braking: 'Braking',
    coasting: 'Coasting',
    unapprovedCircuit: 'Unapproved circuit — local view only',
    saving: 'Saving...',
    saveLap: 'Save lap',
    emptyState: 'Load a .duckdb file to view the circuit layout.',

    slSessions: 'Sessions',
    slImport: 'Import Session',
    slAllCircuits: 'All circuits',
    slAllCars: 'All cars',
    slDate: 'Date',
    slCircuit: 'Circuit',
    slCar: 'Car',
    slLaps: 'Laps',
    slBestTime: 'Best Time',
    slActions: 'Actions',
    slPlaceholder: 'Connect to backend to load sessions...',

    sdSession: 'Session:',
    sdCircuit: 'Circuit',
    sdCar: 'Car',
    sdDate: 'Date',
    sdLapTimes: 'Lap Times',
    sdLap: 'Lap',
    sdTime: 'Time',
    sdLapData: 'Lap data...',
    sdTelemetry: 'Telemetry',
    sdSpeedVsDist: 'Speed vs Distance',
    sdRpmVsDist: 'RPM vs Distance',
    sdTrackMap: 'Track Map',
    sdTrackMapPlaceholder: 'Track map with telemetry data...',

    lcTitle: 'Compare Laps',
    lcSelectLaps: 'Select Laps',
    lcLap1: 'Lap 1 (Reference)',
    lcLap2: 'Lap 2 (Comparison)',
    lcSpeed: 'Speed',
    lcDeltaAnalysis: 'Delta Analysis',
    lcDeltaPlaceholder: 'Cumulative delta chart...',
    lcSectorComparison: 'Sector Comparison',
    lcLap1Header: 'Lap 1',
    lcLap2Header: 'Lap 2',
    lcDifference: 'Difference',
    lcSelectToCompare: 'Select laps to compare...',
    lcSelectSession: 'Select session...',
    lcSelectLap: 'Select lap...',
    lcChartOf: 'Chart of',

    // Novedades
    whatsNew: "What's New",
    whatsNewDesc: 'Latest updates and improvements to ApexDash.',
  },
} as const

export type DashboardStrings = typeof dashboard.es

export function useT(): DashboardStrings {
  const { lang } = useLang()
  return dashboard[lang]
}
