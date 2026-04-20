import { changelog, type ChangeType } from '../data/changelog'
import { useLang, useT } from '../contexts/LanguageContext'

const TYPE_CONFIG: Record<ChangeType, { label: { es: string; en: string }; color: string }> = {
  new:      { label: { es: 'Nuevo',    en: 'New'     }, color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  improved: { label: { es: 'Mejora',   en: 'Improved'}, color: 'bg-blue-500/15    text-blue-400    border-blue-500/30'    },
  fix:      { label: { es: 'Fix',      en: 'Fix'     }, color: 'bg-yellow-500/15  text-yellow-400  border-yellow-500/30'  },
  removed:  { label: { es: 'Removido', en: 'Removed' }, color: 'bg-red-500/15     text-red-400     border-red-500/30'     },
}

function formatDate(dateStr: string, lang: 'es' | 'en') {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default function Novedades() {
  const { lang } = useLang()
  const t = useT()

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-white mb-2">{t.whatsNew}</h1>
      <p className="text-gray-400 text-sm mb-10">{t.whatsNewDesc}</p>

      <div className="relative">
        {/* línea vertical */}
        <div className="absolute left-[7px] top-2 bottom-0 w-px bg-lmu-highlight/40" />

        <div className="flex flex-col gap-10">
          {changelog.map((entry) => (
            <div key={entry.version} className="flex gap-5">
              {/* dot */}
              <div className="mt-1.5 flex-shrink-0 w-3.5 h-3.5 rounded-full bg-lmu-accent border-2 border-lmu-primary z-10" />

              <div className="flex-1 min-w-0">
                {/* header */}
                <div className="flex items-baseline gap-3 flex-wrap mb-1">
                  <span className="text-lmu-accent font-bold text-lg">v{entry.version}</span>
                  <span className="text-white font-semibold">{entry.title[lang]}</span>
                  <span className="text-gray-500 text-xs ml-auto">{formatDate(entry.date, lang)}</span>
                </div>

                {/* items */}
                <ul className="flex flex-col gap-2 mt-3">
                  {entry.items.map((item, i) => {
                    const cfg = TYPE_CONFIG[item.type]
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <span className={`mt-0.5 flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.color}`}>
                          {cfg.label[lang].toUpperCase()}
                        </span>
                        <span className="text-gray-300 text-sm leading-snug">{item[lang]}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
