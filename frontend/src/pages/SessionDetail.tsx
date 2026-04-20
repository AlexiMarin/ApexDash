import { useParams } from 'react-router-dom'
import { useT } from '../contexts/LanguageContext'

export default function SessionDetail() {
  const { sessionId } = useParams()
  const t = useT()

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">{t.sdSession} {sessionId}</h2>

      {/* Session Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard label={t.sdCircuit} value="--" />
        <InfoCard label={t.sdCar} value="--" />
        <InfoCard label={t.sdDate} value="--" />
      </div>

      {/* Lap Times Table */}
      <section className="bg-lmu-secondary rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">{t.sdLapTimes}</h3>
        <table className="w-full">
          <thead className="bg-lmu-highlight">
            <tr>
              <th className="text-left px-4 py-2">{t.sdLap}</th>
              <th className="text-left px-4 py-2">{t.sdTime}</th>
              <th className="text-left px-4 py-2">S1</th>
              <th className="text-left px-4 py-2">S2</th>
              <th className="text-left px-4 py-2">S3</th>
              <th className="text-left px-4 py-2">Delta</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-2 text-gray-400" colSpan={6}>
                {t.sdLapData}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Telemetry Charts */}
      <section className="bg-lmu-secondary rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">{t.sdTelemetry}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartPlaceholder title={t.sdSpeedVsDist} />
          <ChartPlaceholder title={t.sdRpmVsDist} />
          <ChartPlaceholder title="Throttle/Brake" />
          <ChartPlaceholder title="Steering Angle" />
        </div>
      </section>

      {/* Track Map */}
      <section className="bg-lmu-secondary rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">{t.sdTrackMap}</h3>
        <div className="h-64 bg-lmu-highlight rounded flex items-center justify-center text-gray-400">
          {t.sdTrackMapPlaceholder}
        </div>
      </section>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-lmu-secondary rounded-lg p-4 border border-lmu-highlight">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

function ChartPlaceholder({ title }: { title: string }) {
  return (
    <div className="bg-lmu-highlight rounded-lg p-4 h-48 flex items-center justify-center">
      <span className="text-gray-400">{title}</span>
    </div>
  )
}
