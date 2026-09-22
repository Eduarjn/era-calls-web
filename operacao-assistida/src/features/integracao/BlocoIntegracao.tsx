import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import type { Card, Usuario } from '@/domain/types'
import { getProvider, type PessoaExterna } from '@/integrations'
import { useUI } from '@/store/uiStore'
import { useAtualizarCard } from '@/features/board/mutations'
import { chaveEventos, useCriarEvento } from '@/features/historico/mutations'
import { importarTicketsDoCard, ticketParaEvento, useConfigIntegracao } from './useIntegracao'

interface Props { card: Card; boardId: string; usuarioAtual?: Usuario }

/** Bloco no painel do cliente: vincular ao sistema externo, ver tickets, importar histórico, abrir ticket. */
export function BlocoIntegracao({ card, boardId, usuarioAtual }: Props) {
  const config = useConfigIntegracao(boardId)
  const salvar = useAtualizarCard(boardId)
  const criarEvento = useCriarEvento(card.id)
  const notificar = useUI((s) => s.notificar)
  const qc = useQueryClient()
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<PessoaExterna[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [importando, setImportando] = useState(false)

  const provider = config.data ? getProvider(config.data) : null
  const ativa = !!config.data?.ativa && !!provider

  const tickets = useQuery({
    queryKey: ['tickets', config.data?.provider, card.clienteId],
    queryFn: () => provider!.listarTickets(card.clienteId!),
    enabled: ativa && !!card.clienteId,
    staleTime: 60_000,
  })

  useEffect(() => { setResultados(null); setTermo('') }, [card.id])

  async function buscar() {
    if (!provider) return
    setBuscando(true)
    try { setResultados(await provider.buscarPessoas(termo || card.clienteNome)) }
    catch (e) { notificar({ mensagem: `Busca falhou: ${e instanceof Error ? e.message : e}` }) }
    finally { setBuscando(false) }
  }

  function vincular(p: PessoaExterna) {
    salvar.mutate({ id: card.id, patch: {
      clienteId: p.id,
      contatoPrincipal: card.contatoPrincipal?.nome ? card.contatoPrincipal : { nome: p.tipo === 'pessoa' ? p.nome : (card.contatoPrincipal?.nome ?? ''), email: p.email, telefone: p.telefone },
    } })
    criarEvento.mutate({ cardId: card.id, tipo: 'sistema', titulo: `Vinculado a ${p.nome} (${provider?.nome} #${p.id})`, dataHora: new Date().toISOString(), autorId: usuarioAtual?.id, autorNome: usuarioAtual?.nome ?? 'Você', origem: 'manual', geradoPeloSistema: true, meta: { integracao: provider?.id, pessoaId: p.id } })
    setResultados(null)
  }

  async function importar() {
    if (!config.data) return
    setImportando(true)
    try {
      const n = await importarTicketsDoCard(card, config.data)
      qc.invalidateQueries({ queryKey: chaveEventos(card.id) }); qc.invalidateQueries({ queryKey: ['eventos-board'] })
      notificar({ mensagem: n ? `${n} ticket(s) importado(s) para o histórico` : 'Nenhum ticket novo para importar' })
    } catch (e) { notificar({ mensagem: `Importação falhou: ${e instanceof Error ? e.message : e}` }) }
    finally { setImportando(false) }
  }

  async function novoTicket() {
    if (!provider || !card.clienteId) return
    const assunto = prompt('Assunto do ticket:'); if (!assunto?.trim()) return
    try {
      const t = await provider.criarTicket({ clienteId: card.clienteId, assunto: assunto.trim(), descricao: `Aberto pela Operação Assistida (${card.codigo}).` })
      await criarEvento.mutateAsync(ticketParaEvento(card.id, t, provider.nome))
      tickets.refetch()
      notificar({ mensagem: `Ticket #${t.numero} criado no ${provider.nome}` })
    } catch (e) { notificar({ mensagem: `Não deu para criar o ticket: ${e instanceof Error ? e.message : e}` }) }
  }

  if (!config.data) return null
  if (!ativa) return <div className="text-[12.5px] text-muted border border-dashed border-line rounded-box p-3">Integração desligada neste quadro. Ative em <b>⇅ Integração</b>.</div>

  return (
    <div className="rounded-box border border-line p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="lbl">⇅ {provider!.nome}</span>
        {card.clienteId ? <span className="font-mono text-[11px] text-muted">vinculado #{card.clienteId}</span> : <span className="font-mono text-[11px] text-amber">não vinculado</span>}
        <span className="flex-1" />
        {card.clienteId && <button className="btn btn-soft btn-sm" onClick={() => salvar.mutate({ id: card.id, patch: { clienteId: undefined } })}>Desvincular</button>}
      </div>

      {!card.clienteId && (
        <div>
          <div className="flex gap-1.5">
            <input className="!py-1.5 !text-[13px]" placeholder={`Nome, CNPJ ou id (ex.: ${card.clienteNome})`} value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} aria-label="Buscar no sistema externo" />
            <button className="btn btn-ghost btn-sm" onClick={buscar} disabled={buscando}>{buscando ? '…' : 'Buscar'}</button>
          </div>
          {resultados && (
            <ul className="mt-2 border border-line rounded-ctl divide-y divide-line max-h-[200px] overflow-y-auto">
              {resultados.length === 0 && <li className="text-[12.5px] text-muted p-2.5">Nada encontrado.</li>}
              {resultados.map((p) => (
                <li key={p.id} className="flex items-center gap-2 p-2 text-[13px] hover:bg-soft3">
                  <span className="text-[14px]" aria-hidden>{p.tipo === 'organizacao' ? '🏢' : '👤'}</span>
                  <span className="flex-1 min-w-0"><span className="font-semibold text-navy block truncate">{p.nome}</span><span className="text-[11.5px] text-muted font-mono">{[p.documento, p.email, p.organizacao].filter(Boolean).join(' · ')}</span></span>
                  <button className="btn btn-primary btn-sm" onClick={() => vincular(p)}>Vincular</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {card.clienteId && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12.5px] text-muted">Tickets {tickets.data ? `(${tickets.data.length})` : ''}</span>
            <span className="flex-1" />
            <button className="btn btn-soft btn-sm" onClick={() => tickets.refetch()} disabled={tickets.isFetching}>↻</button>
            <button className="btn btn-soft btn-sm" onClick={importar} disabled={importando || !tickets.data?.length}>{importando ? '…' : 'Importar p/ histórico'}</button>
            <button className="btn btn-ghost btn-sm" onClick={novoTicket}>+ Ticket</button>
          </div>
          {tickets.isLoading && <div className="skel h-10" />}
          {tickets.isError && <div className="text-[12.5px] text-red">Não deu para carregar os tickets: {(tickets.error as Error).message}</div>}
          {tickets.data && tickets.data.length === 0 && <div className="text-[12.5px] text-muted">Nenhum ticket para este cliente.</div>}
          <ul className="flex flex-col gap-1">
            {tickets.data?.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[12.5px] rounded-ctl border border-line px-2 py-1.5">
                <a href={t.url} target="_blank" rel="noreferrer" className="font-mono text-accent2 underline underline-offset-2">#{t.numero}</a>
                <span className="flex-1 truncate text-navy" title={t.assunto}>{t.assunto}</span>
                <span className="rounded-badge bg-soft2 px-1.5 py-0.5 font-mono text-[10.5px]">{t.status}</span>
                <span className="font-mono text-[10.5px] text-muted whitespace-nowrap">{t.responsavel ?? '—'} · {format(new Date(t.criadoEm), 'dd/MM')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
