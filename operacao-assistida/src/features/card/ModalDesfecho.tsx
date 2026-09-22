import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import type { Card, ResultadoFinal } from '@/domain/types'

const OPCOES: { valor: ResultadoFinal; rotulo: string; dica: string; cor: string }[] = [
  { valor: 'estabilizado', rotulo: 'Estabilizado', dica: 'Cliente operando sozinho, sem pendências.', cor: 'var(--green)' },
  { valor: 'prorrogado', rotulo: 'Prorrogado', dica: 'Precisa de mais tempo de acompanhamento.', cor: 'var(--amber)' },
  { valor: 'escalado', rotulo: 'Escalado', dica: 'Foi para outro time (suporte, engenharia).', cor: 'var(--blue)' },
  { valor: 'churn', rotulo: 'Churn', dica: 'Cliente cancelou ou desistiu.', cor: 'var(--red)' },
]

interface Props {
  card: Card | null
  ocupado?: boolean
  onConfirmar: (dados: { resultadoFinal: ResultadoFinal; justificativa: string; dataSaidaReal: string }) => void
  onFechar: () => void
}

/** Finalização é sempre uma ação explícita: resultado + justificativa + data de saída. */
export function ModalDesfecho({ card, ocupado, onConfirmar, onFechar }: Props) {
  const [resultado, setResultado] = useState<ResultadoFinal>('estabilizado')
  const [justificativa, setJustificativa] = useState('')
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'))
  const valido = justificativa.trim().length >= 3 && !!data

  return (
    <AnimatePresence>
      {card && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-4 bg-navy/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onFechar}>
          <motion.form
            role="dialog" aria-modal="true" aria-labelledby="desfecho-titulo"
            className="w-full max-w-[460px] bg-modal border border-line rounded-box shadow-lift p-5"
            style={{ borderTop: '3px solid var(--accent)' }}
            initial={{ y: 12, scale: .98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (valido) onConfirmar({ resultadoFinal: resultado, justificativa: justificativa.trim(), dataSaidaReal: new Date(data + 'T12:00:00').toISOString() }) }}
          >
            <div className="font-mono text-[11px] text-muted">{card.codigo}</div>
            <h3 id="desfecho-titulo" className="text-[19px] mt-0.5">Finalizar {card.clienteNome}</h3>
            <p className="text-[13px] text-muted mt-1">O cliente sai do quadro ativo e continua acessível no histórico.</p>

            <div className="lbl mt-4 mb-2">Resultado</div>
            <div className="grid grid-cols-2 gap-2">
              {OPCOES.map((o) => (
                <label key={o.valor} className={`cursor-pointer rounded-ctl border p-2.5 transition-colors ${resultado === o.valor ? 'border-accent2 bg-accent2/5' : 'border-line hover:border-muted'}`}>
                  <input type="radio" name="resultado" className="sr-only" checked={resultado === o.valor} onChange={() => setResultado(o.valor)} />
                  <div className="flex items-center gap-2 font-semibold text-[13.5px] text-navy"><span className="w-2.5 h-2.5 rounded-full" style={{ background: o.cor }} />{o.rotulo}</div>
                  <div className="text-[11.5px] text-muted mt-0.5">{o.dica}</div>
                </label>
              ))}
            </div>

            <label className="block mt-4">
              <span className="lbl block mb-1.5">Justificativa</span>
              <textarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="O que aconteceu e por que este é o desfecho." autoFocus />
            </label>
            <label className="block mt-3">
              <span className="lbl block mb-1.5">Data de saída</span>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </label>

            <div className="flex items-center gap-2 mt-5">
              <button type="button" className="btn btn-soft" onClick={onFechar}>Cancelar</button>
              <span className="flex-1" />
              <button type="submit" className="btn btn-primary" disabled={!valido || ocupado}>Finalizar cliente</button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
