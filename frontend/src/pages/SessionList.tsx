import { useT } from '../contexts/LanguageContext'

export default function SessionList() {
  const t = useT()
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">{t.slSessions}</h2>
        <button className="bg-lmu-accent hover:bg-yellow-400 text-black font-semibold px-4 py-2 rounded-lg transition-colors">
          {t.slImport}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-lmu-secondary rounded-lg p-4 flex gap-4">
        <select className="bg-lmu-highlight border border-gray-600 rounded px-3 py-2">
          <option>{t.slAllCircuits}</option>
        </select>
        <select className="bg-lmu-highlight border border-gray-600 rounded px-3 py-2">
          <option>{t.slAllCars}</option>
        </select>
        <input 
          type="date" 
          className="bg-lmu-highlight border border-gray-600 rounded px-3 py-2"
        />
      </div>

      {/* Session Table */}
      <div className="bg-lmu-secondary rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-lmu-highlight">
            <tr>
              <th className="text-left px-4 py-3">{t.slDate}</th>
              <th className="text-left px-4 py-3">{t.slCircuit}</th>
              <th className="text-left px-4 py-3">{t.slCar}</th>
              <th className="text-left px-4 py-3">{t.slLaps}</th>
              <th className="text-left px-4 py-3">{t.slBestTime}</th>
              <th className="text-left px-4 py-3">{t.slActions}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-lmu-highlight">
              <td className="px-4 py-3 text-gray-400" colSpan={6}>
                {t.slPlaceholder}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
