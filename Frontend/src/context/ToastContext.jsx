import { createContext, useCallback, useContext, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { t as tr } from '../i18n/I18nProvider'

const ToastContext = createContext(null)
const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info }
const STYLES = {
  success: 'border-primary-200 bg-white text-forest [&_svg.lead]:text-primary-600',
  error: 'border-clay-100 bg-white text-clay-700 [&_svg.lead]:text-clay-500',
  info: 'border-gold-200 bg-white text-forest [&_svg.lead]:text-gold-600',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback((message, { type = 'success', description } = {}) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t.slice(-2), { id, message, type, description }])
    setTimeout(() => dismiss(id), 4200)
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:bottom-6 sm:start-auto sm:end-6 sm:top-auto sm:items-end" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICONS[t.type]
            return (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-pop ${STYLES[t.type]}`} role="status">
                <Icon size={20} className="lead mt-0.5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold">{tr(t.message)}</p>
                  {t.description && <p className="mt-0.5 text-[12.5px] text-ink-muted">{tr(t.description)}</p>}
                </div>
                <button type="button" onClick={() => dismiss(t.id)} className="-me-1 rounded-lg p-1 text-ink-muted hover:bg-ivory-100" aria-label={tr('Dismiss')}><X size={16} /></button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
