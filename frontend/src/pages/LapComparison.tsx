import { useT } from '../contexts/LanguageContext'

export default function LapComparison() {
  const t = useT()
  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">{t.lcTitle}</h2>

      {/* Lap Selection */}
      <div className="bg-lmu-secondary rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">{t.lcSelectLaps}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <LapSelector label={t.lcLap1} color="blue" selectSession={t.lcSelectSession} selectLap={t.lcSelectLap} />
          <LapSelector label={t.lcLap2} color="red" selectSession={t.lcSelectSession} selectLap={t.lcSelectLap} />
        </div>
      </div>

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 gap-6">
        <ComparisonChart title={t.lcSpeed} chartOf={t.lcChartOf} />
        <ComparisonChart title="Throttle" chartOf={t.lcChartOf} />
        <ComparisonChart title="Brake" chartOf={t.lcChartOf} />
        <ComparisonChart title="Gear" chartOf={t.lcChartOf} />
        <ComparisonChart title="Steering" chartOf={t.lcChartOf} />
      </div>

      {/* Delta Analysis */}
      <section className="bg-lmu-secondary rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">{t.lcDeltaAnalysis}</h3>
        <div className="h-32 bg-lmu-highlight rounded flex items-center justify-center text-gray-400">
          {t.lcDeltaPlaceholder}
        </div>
      </section>

      {/* Sector Comparison */}
      <section className="bg-lmu-secondary rounded-lg p-6">
        <h3 className="text-xl font-semibold mb-4">{t.lcSectorComparison}</h3>
        <table className="w-full">
          <thead className="bg-lmu-highlight">
            <tr>
              <th className="text-left px-4 py-2">Sector</th>
              <th className="text-left px-4 py-2">{t.lcLap1Header}</th>
              <th className="text-left px-4 py-2">{t.lcLap2Header}</th>
              <th className="text-left px-4 py-2">{t.lcDifference}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-2 text-gray-400" colSpan={4}>
                {t.lcSelectToCompare}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}

function LapSelector({ label, color, selectSession, selectLap }: { label: string; color: string; selectSession: string; selectLap: string }) {
  const borderColor = color === 'blue' ? 'border-blue-500' : 'border-red-500'
  
  return (
    <div className={`border-2 ${borderColor} rounded-lg p-4`}>
      <p className="font-semibold mb-3">{label}</p>
      <div className="space-y-2">
        <select className="w-full bg-lmu-highlight border border-gray-600 rounded px-3 py-2">
          <option>{selectSession}</option>
        </select>
        <select className="w-full bg-lmu-highlight border border-gray-600 rounded px-3 py-2">
          <option>{selectLap}</option>
        </select>
      </div>
    </div>
  )
}

function ComparisonChart({ title, chartOf }: { title: string; chartOf: string }) {
  return (
    <section className="bg-lmu-secondary rounded-lg p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="h-48 bg-lmu-highlight rounded flex items-center justify-center text-gray-400">
        {chartOf} {title.toLowerCase()}...
      </div>
    </section>
  )
}
