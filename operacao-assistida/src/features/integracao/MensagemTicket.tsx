import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/data'
import type { Card } from '@/domain/types'
import { useUsuarioAtual } from '@/features/board/useBoard'
import { chaveEventos } from '@/features/historico/mutations'
import { useUI } from '@/store/uiStore'
import { MODELOS_MENSAGEM, publicarNoTicket, type DadosTicket, type TipoAcaoTicket } from '@/integrations/ticketImplantacao'

interface Props {
  card: Card
  ticket: string
  dados?: DadosTicket
  aberto: boolean
  onFechar: () => void
}

/**
 * Escreve uma interação no ticket do Movidesk a partir do card (ex.: encerramento da operação assistida).
 * Pública = o Movidesk envia por e-mail aos clientes e cópias do ticket. Sempre com revisão e confirmação.
 */
export function MensagemTicket({ card, ticket, dados, aberto, onFechar }: Props) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  const usuario = useUsuarioAtual()
  const [modelo, setModelo] = useState(MODELOS_MENSAGEM[0]!.id)
  const [tipo, setTipo] = useState<TipoAcaoTicket>('publica')
  const [texto, setTexto] = useState('')
  const [encaminhar, setEncaminhar] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const preencher = (id: string) =>
    setTexto(MODELOS_MENSAGEM.find((m) => m.id === id)!.texto({ contato: dados?.contatoNome, empresa: dados?.empresa, autor: usuario.data?.nome }))

  useEffect(() => {
    if (!aberto) return
    setModelo(MODELOS_MENSAGEM[0]!.id); setTipo('publica'); setEncaminhar(MODELOS_MENSAGEM[0]!.id === 'encerramento'); setErro(null); preencher(MODELOS_MENSAGEM[0]!.id)
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar() {
    setEnviando(true); setErro(null)
    try {
      const { autor, encaminhadoPara, avisoEncaminhar } = await publicarNoTicket(ticket, texto, tipo, encaminhar)
      const nomeModelo = MODELOS_MENSAGEM.find((m) => m.id === modelo)?.nome ?? 'Mensagem'
      await getRepository().criarEvento({
        cardId: card.id, tipo: 'ticket',
        titulo: `${modelo === 'livre' ? 'Mensagem' : nomeModelo} ${tipo === 'publica' ? 'enviada ao cliente' : 'registrada como nota interna'} no ticket #${ticket}`,
        descricao: texto, dataHora: new Date().toISOString(),
        autorId: usuario.data?.id, autorNome: autor ?? usuario.data?.nome ?? 'Você',
        origem: 'integracao', geradoPeloSistema: false, linkExterno: dados?.url,
        meta: { ticketId: ticket, tipoAcao: tipo, modelo, encaminhadoPara: encaminhadoPara ?? undefined },
      })
      if (encaminhadoPara) {
        await getRepository().criarEvento({
          cardId: card.id, tipo: 'ticket', titulo: `Ticket #${ticket} passado para ${encaminhadoPara} (Financeiro)`,
          dataHora: new Date().toISOString(), autorId: usuario.data?.id, autorNome: autor ?? usuario.data?.nome ?? 'Você',
          origem: 'integracao', geradoPeloSistema: false, linkExterno: dados?.ticketOA?.url, meta: { ticketId: ticket, encaminhadoPara },
        })
      }
      qc.invalidateQueries({ queryKey: chaveEventos(card.id) })
      notificar({ mensagem: avisoEncaminhar ?? `Mensagem publicada no ticket #${ticket}${encaminhadoPara ? ` e passada para ${encaminhadoPara}` : ''}` })
      if (avisoEncaminhar) { setErro(avisoEncaminhar); return }
      onFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally { setEnviando(false) }
  }

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center p-4 bg-navy/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !enviando && onFechar()}>
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="msg-ticket-titulo"
            className="w-full max-w-[600px] max-h-[92vh] overflow-y-auto bg-modal border border-line rounded-box shadow-lift p-5"
            style={{ borderTop: '3px solid var(--accent2)' }}
            initial={{ y: 12, scale: .98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-[11px] text-muted">{card.codigo} · ticket #{ticket}</div>
            <h3 id="msg-ticket-titulo" className="text-[18px] mt-0.5">Mensagem no ticket de Operação Assistida</h3>
            {dados?.ticketOA && <div className="text-[12px] text-muted mt-0.5 truncate" title={dados.ticketOA.assunto}>{dados.ticketOA.assunto}</div>}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <label className="block">
                <span className="lbl block mb-1.5">Modelo</span>
                <select value={modelo} onChange={(e) => { setModelo(e.target.value); preencher(e.target.value); setEncaminhar(e.target.value === 'encerramento') }}>
                  {MODELOS_MENSAGEM.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="lbl block mb-1.5">Tipo</span>
                <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAcaoTicket)}>
                  <option value="publica">Pública — cliente recebe por e-mail</option>
                  <option value="interna">Interna — só a equipe vê</option>
                </select>
              </label>
            </div>

            <label className="block mt-3">
              <span className="lbl block mb-1.5">Texto (revise antes de enviar)</span>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={16} className="!text-[13px] leading-relaxed" />
            </label>

            {tipo === 'publica' && (
              <div className="text-[12px] text-muted mt-2">
                O Movidesk envia por e-mail aos clientes e às cópias do ticket{dados?.empresa ? ` (${dados.empresa})` : ''}. Não dá para desfazer depois de enviado.
              </div>
            )}
            <label className="flex items-start gap-2 mt-3 text-[13px] cursor-pointer">
              <input type="checkbox" className="!w-auto mt-0.5" checked={encaminhar} onChange={(e) => setEncaminhar(e.target.checked)} />
              <span>Depois de publicar, passar o ticket #{ticket} para o <b>Financeiro</b> com <b>Natali Silva</b> como responsável</span>
            </label>
            {erro && <div className="text-[12.5px] text-red mt-2">Não deu para publicar: {erro}</div>}

            <div className="flex items-center gap-2 mt-4">
              <span className="flex-1" />
              <button className="btn btn-soft" onClick={onFechar} disabled={enviando}>Cancelar</button>
              <button className="btn btn-primary" onClick={enviar} disabled={enviando || texto.trim().length < 5}>
                {enviando ? 'Publicando…' : tipo === 'publica' ? `Enviar ao cliente no ticket #${ticket}` : `Registrar nota no ticket #${ticket}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
