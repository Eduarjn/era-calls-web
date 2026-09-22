import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/data'
import type { Board, Card, Evento } from '@/domain/types'
import { getProvider, type ConfigIntegracao, type TicketExterno } from '@/integrations'
import { useUI } from '@/store/uiStore'
import { chaveEventos } from '@/features/historico/mutations'

export const chaveConfig = (boardId: string) => ['integracao', boardId] as const

export function useConfigIntegracao(boardId: string | undefined) {
  return useQuery({ queryKey: chaveConfig(boardId ?? ''), queryFn: () => getRepository().obterConfigIntegracao(boardId!), enabled: !!boardId, staleTime: 60_000 })
}

export function useSalvarConfigIntegracao(boardId: string) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  return useMutation({
    mutationFn: (c: ConfigIntegracao) => getRepository().salvarConfigIntegracao(c),
    onSuccess: (c) => { qc.setQueryData(chaveConfig(boardId), c) },
    onError: () => notificar({ mensagem: 'Não deu para salvar a configuração da integração.' }),
  })
}

/** Ticket → evento de histórico (origem integração). A chave de deduplicação é meta.ticketId. */
export function ticketParaEvento(cardId: string, t: TicketExterno, providerNome: string): Omit<Evento, 'id'> {
  return {
    cardId, tipo: 'ticket', titulo: `Ticket #${t.numero}: ${t.assunto}`,
    descricao: [t.status && `Status: ${t.status}`, t.responsavel && `Responsável: ${t.responsavel}`, t.categoria && `Categoria: ${t.categoria}`].filter(Boolean).join(' · '),
    dataHora: t.criadoEm, autorNome: providerNome, anexos: [], linkExterno: t.url, origem: 'integracao', geradoPeloSistema: false,
    meta: { ticketId: t.id, status: t.status, atualizadoEm: t.atualizadoEm },
  }
}

/** Importa tickets de um card sem duplicar. Devolve quantos entraram. */
export async function importarTicketsDoCard(card: Card, config: ConfigIntegracao): Promise<number> {
  if (!card.clienteId) return 0
  const repo = getRepository()
  const provider = getProvider(config)
  const [tickets, existentes] = await Promise.all([provider.listarTickets(card.clienteId), repo.listarEventos(card.id)])
  const jaTem = new Set(existentes.map((e) => e.meta?.ticketId).filter(Boolean) as string[])
  let n = 0
  for (const t of tickets) {
    if (jaTem.has(t.id)) continue
    await repo.criarEvento(ticketParaEvento(card.id, t, provider.nome))
    n++
  }
  return n
}

/**
 * Sincronização do board: manual (botão), agendada (intervalo em minutos) e — quando publicada —
 * por webhook (a Edge Function grava direto em oa_eventos). Nunca falha em silêncio.
 */
export function useSincronizacao(board: Board | undefined, cards: Card[] | undefined, config: ConfigIntegracao | undefined) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  const salvar = useSalvarConfigIntegracao(board?.id ?? '')
  const [executando, setExecutando] = useState(false)
  const timer = useRef<number | null>(null)

  const sincronizar = useCallback(async (silencioso = false) => {
    if (!board || !cards || !config || !config.ativa || executando) return
    setExecutando(true)
    try {
      const vinculados = cards.filter((c) => c.clienteId && c.status !== 'cancelado')
      let total = 0
      for (const c of vinculados) {
        total += await importarTicketsDoCard(c, config)
        qc.invalidateQueries({ queryKey: chaveEventos(c.id) })
      }
      qc.invalidateQueries({ queryKey: ['eventos-board'] })
      await salvar.mutateAsync({ ...config, ultimaSync: new Date().toISOString(), ultimoErro: undefined })
      if (!silencioso || total > 0) notificar({ mensagem: total ? `Sincronização: ${total} ticket(s) importado(s) de ${vinculados.length} cliente(s)` : `Sincronização OK — nada novo em ${vinculados.length} cliente(s) vinculado(s)` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await salvar.mutateAsync({ ...config, ultimoErro: msg }).catch(() => undefined)
      notificar({ mensagem: `Sincronização falhou: ${msg}`, duracao: 9000 })
    } finally {
      setExecutando(false)
    }
  }, [board, cards, config, executando, qc, salvar, notificar])

  // Agendada
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current)
    if (!config?.ativa || !config.agendamentoMin) return
    timer.current = window.setInterval(() => sincronizar(true), config.agendamentoMin * 60_000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [config?.ativa, config?.agendamentoMin, sincronizar])

  return { sincronizar: () => sincronizar(false), executando }
}
