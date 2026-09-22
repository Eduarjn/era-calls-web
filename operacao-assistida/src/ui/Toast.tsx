import { AnimatePresence, motion } from 'framer-motion'
import { useUI } from '@/store/uiStore'

/** Avisos curtos no rodapé, com ação (Desfazer) quando houver. */
export function ToastHost() {
  const toasts = useUI((s) => s.toasts)
  const fechar = useUI((s) => s.fecharToast)
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: .96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: .98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex items-center gap-3 bg-navy text-bg2 rounded-box px-4 py-3 shadow-lift text-[13.5px] font-medium max-w-[92vw]"
            style={{ borderLeft: '3px solid var(--accent)' }}
          >
            <span className="truncate">{t.mensagem}</span>
            {t.acao && (
              <button
                className="font-semibold underline underline-offset-2 hover:opacity-80 shrink-0"
                onClick={() => { t.acao!.executar(); fechar(t.id) }}
              >
                {t.acao.rotulo}
              </button>
            )}
            <button className="opacity-60 hover:opacity-100 shrink-0" onClick={() => fechar(t.id)} aria-label="Fechar aviso">✕</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
