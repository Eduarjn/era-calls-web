import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { getRepository } from '@/data'
import type { Card } from '@/domain/types'
import { noFuso } from '@/domain/datas'
import { chaves } from '@/features/board/useBoard'
import {
  buscarDadosTicket, CHAVE_MOVIDESK, CHAVE_TICKET, dadosTicketDoCard, ticketDoCard,
  type AgendaTicket, type DadosTicket,
} from '@/integrations/ticketImplantacao'
import { MensagemTicket } from './MensagemTicket'

/** Lê o ticket no Movidesk e grava no card, mesclando com os campos mais recentes (não sobrescreve edição de outra pessoa). */
export async function salvarDadosTicket(card: Card, ticket: string): Promise<DadosTicket> {
  const dados = await buscarDadosTicket(ticket, card.clienteNome)
  const repo = getRepository()
  const atual = (await repo.obterCard(card.id)) ?? card
  await repo.atualizarCard(card.id, {
    camposCustomizados: { ...atual.camposCustomizados, [CHAVE_MOVIDESK]: JSON.stringify(dados), [CHAVE_TICKET]: ticket },
  })
  return dados
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Card novo (ou antigo) com número de ticket e sem dados do Movidesk → lê sozinho, um por vez.
 * O Movidesk limita 10 req/min de dia e o mesmo token atende o chatbot do Omnichannel: 1 leitura a cada 6,5 s.
 */
export function useLeituraTicketsAutomatica(boardId: string | undefined, cards: Card[] | undefined) {
  const qc = useQueryClient()
  const tentados = useRef(new Set<string>())
  const rodando = useRef(false)

  useEffect(() => {
    if (!boardId || !cards || rodando.current) return
    const fila = cards.filter((c) =>
      (c.status === 'ativo' || c.status === 'pausado') && !dadosTicketDoCard(c) && ticketDoCard(c) && !tentados.current.has(c.id))
    if (!fila.length) return
    rodando.current = true
    ;(async () => {
      for (const [i, c] of fila.entries()) {
        tentados.current.add(c.id)
        if (i) await esperar(6500)
        try {
          await salvarDadosTicket(c, ticketDoCard(c)!)
          await qc.invalidateQueries({ queryKey: chaves.cards(boardId) })
        } catch (e) {
          console.warn('[operacao-assistida] leitura do ticket', ticketDoCard(c), 'falhou:', e)
        }
      }
      rodando.current = false
    })()
  }, [boardId, cards, qc])
}

const fmtCriado = (iso: string, fuso: string) => format(noFuso(iso, fuso), "dd/MM/yyyy 'às' HH:mm")
function fmtAgenda(a: AgendaTicket): string {
  const [dia, hora] = a.quando.split('T')
  const [y, m, d] = dia!.split('-').map(Number)
  const semana = format(new Date(y!, m! - 1, d!), 'EEEE', { locale: ptBR })
  return `${semana}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}${hora ? ` às ${hora}` : ''}`
}

/** Bloco "Dados do Movidesk" no painel do cliente: só visualização + atualizar. */
export function BlocoTicketMovidesk({ card, boardId, fuso }: { card: Card; boardId: string; fuso: string }) {
  const qc = useQueryClient()
  const dados = dadosTicketDoCard(card)
  const ticket = ticketDoCard(card)
  const [digitado, setDigitado] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mensagemAberta, setMensagemAberta] = useState(false)

  useEffect(() => { setErro(null); setDigitado(''); setMensagemAberta(false) }, [card.id])

  async function ler(numero: string) {
    setCarregando(true); setErro(null)
    try {
      await salvarDadosTicket(card, numero)
      await qc.invalidateQueries({ queryKey: chaves.cards(boardId) })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally { setCarregando(false) }
  }

  const linhas: [string, string | undefined, string?][] = dados ? [
    ['Ticket Op. Assistida', dados.ticketOA?.numero],
    ['Domínio de acesso', dados.dominio],
    ['Cliente (responsável)', dados.contatoNome],
    ['Empresa', dados.empresa],
    ['CNPJ', dados.cnpj],
    ['Telefone', dados.telefone],
    ['Ticket criado em', dados.criadoEm ? fmtCriado(dados.criadoEm, fuso) : undefined],
    ['Reunião de escopo', dados.reuniaoEscopo ? fmtAgenda(dados.reuniaoEscopo) : undefined,
      dados.reuniaoEscopo?.origem === 'mencao' ? 'citada no texto do ticket' : undefined],
    ['Treinamento', dados.treinamento ? fmtAgenda(dados.treinamento) : undefined,
      dados.treinamento?.origem === 'mencao' ? 'citado no texto do ticket' : undefined],
  ] : []

  return (
    <div className="rounded-box border border-line bg-soft3 p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="lbl">Dados do Movidesk</span>
        {ticket && (
          dados?.url
            ? <a href={dados.url} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-accent2 hover:underline">ticket #{ticket} ↗</a>
            : <span className="font-mono text-[11.5px] text-muted">ticket #{ticket}</span>
        )}
        <span className="flex-1" />
        {ticket && (
          <button className="btn btn-soft btn-sm" disabled={!dados?.ticketOA} onClick={() => setMensagemAberta(true)}
            title={dados?.ticketOA ? `Escrever no ticket de Operação Assistida #${dados.ticketOA.numero}` : 'Sem ticket de Operação Assistida relacionado a este ticket'}>✉ Mensagem no ticket OA</button>
        )}
        {ticket && (
          <button className="btn btn-soft btn-sm" disabled={carregando} onClick={() => ler(ticket)} title="Ler de novo o ticket no Movidesk">
            {carregando ? 'Lendo…' : dados ? '↻ Atualizar' : 'Buscar'}
          </button>
        )}
      </div>

      {!ticket && (
        <div className="flex items-center gap-2">
          <input className="!py-1.5 !text-[13px]" placeholder="Nº do ticket de implantação" value={digitado} inputMode="numeric"
            onChange={(e) => setDigitado(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter' && digitado) ler(digitado) }} />
          <button className="btn btn-soft btn-sm" disabled={!digitado || carregando} onClick={() => ler(digitado)}>{carregando ? 'Lendo…' : 'Buscar'}</button>
        </div>
      )}

      {ticket && !dados && !erro && (
        <div className="text-[12.5px] text-muted">{carregando ? 'Lendo o ticket…' : 'Ainda não lido. Clique em Buscar (ou aguarde a leitura automática).'}</div>
      )}

      {dados && (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {linhas.map(([rot, val, obs]) => (
            <div key={rot} className="contents">
              <dt className="text-muted">{rot}</dt>
              <dd className={val ? 'text-navy font-semibold' : 'text-muted italic'}>
                {rot === 'Ticket Op. Assistida' && dados.ticketOA ? (
                  <a href={dados.ticketOA.url} target="_blank" rel="noreferrer" className="font-mono text-accent2 hover:underline" title={dados.ticketOA.assunto}>
                    #{dados.ticketOA.numero} ↗{dados.ticketOA.status && <span className="font-sans font-normal text-muted text-[11.5px]"> · {dados.ticketOA.status}</span>}
                  </a>
                ) : rot === 'Ticket Op. Assistida' ? <span>nenhum ticket filho "Op. Assistida" (clique em ↻ Atualizar depois que o Onboarding abrir)</span>
                : rot === 'Domínio de acesso' && val ? <Dominio host={val} /> : val ?? (rot.startsWith('Reunião') || rot.startsWith('Treinamento') ? 'sem agenda no ticket' : 'não informado no ticket')}
                {obs && <span className="font-normal text-muted text-[11.5px]"> · {obs}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {erro && <div className="text-[12.5px] text-red mt-2">Não deu para ler o ticket: {erro}</div>}
      {dados && <div className="text-[11px] text-muted mt-2.5">Lido do Movidesk em {fmtCriado(dados.lidoEm, fuso)} · só visualização</div>}
      {dados?.ticketOA && <MensagemTicket card={card} ticket={dados.ticketOA.numero} dados={dados} aberto={mensagemAberta} onFechar={() => setMensagemAberta(false)} />}
    </div>
  )
}

/** Domínio clicável (abre a plataforma do cliente) + botão de copiar. */
function Dominio({ host }: { host: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try { await navigator.clipboard.writeText(host); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch { /* sem permissão */ }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <a href={`https://${host}`} target="_blank" rel="noreferrer" className="font-mono text-accent2 hover:underline" title="Abrir a plataforma do cliente">{host} ↗</a>
      <button type="button" className="btn btn-soft btn-sm !py-0.5 !px-2 !text-[11px]" onClick={copiar} title="Copiar domínio">{copiado ? '✓ Copiado' : '⧉ Copiar'}</button>
    </span>
  )
}
