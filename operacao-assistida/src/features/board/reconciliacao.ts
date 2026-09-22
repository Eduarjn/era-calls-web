import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/data'
import type { Board, Card } from '@/domain/types'
import { agora, hojeISO } from '@/domain/datas'
import { calcularSaude, reconciliar } from '@/domain/esteira'
import { useUI } from '@/store/uiStore'
import { chaves } from './useBoard'

const agoraISO = () => new Date().toISOString()

/**
 * Reconciliação por tempo: roda ao carregar, à meia-noite do fuso do board e sob demanda.
 * Avança os cards para a fase esperada (evento de origem `sistema`) e persiste a saúde calculada.
 */
export function useReconciliacao(board: Board | undefined, cards: Card[] | undefined) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  const [ultima, setUltima] = useState<string | null>(null)
  const [executando, setExecutando] = useState(false)
  const jaRodouAoCarregar = useRef(false)

  const executar = useCallback(async (avisarSemMudanca = false) => {
    if (!board || !cards || executando) return
    setExecutando(true)
    const repo = getRepository()
    const fuso = board.configuracoes.fusoHorario
    const hoje = hojeISO(fuso)
    try {
      const movimentos = reconciliar(cards, board.fases, board.configuracoes.automacaoAtiva, hoje, fuso)
      const porId = new Map(board.fases.map((f) => [f.id, f]))
      for (const m of movimentos) {
        await repo.atualizarCard(m.card.id, { faseId: m.paraFaseId, dataEntradaNaFase: agoraISO() })
        await repo.criarEvento({
          cardId: m.card.id, tipo: 'mudanca_de_fase',
          titulo: `Avançou automaticamente para ${porId.get(m.paraFaseId)?.nome ?? '—'}`,
          descricao: `Pelo tempo decorrido desde a entrada (${m.card.dataEntrada.slice(0, 10)}).`,
          dataHora: agoraISO(), autorNome: 'Sistema', origem: 'manual', geradoPeloSistema: true,
          meta: { deFaseId: m.deFaseId, paraFaseId: m.paraFaseId, automatico: true },
        })
      }
      // Saúde calculada é persistida para relatórios; a exibição já usa a regra ao vivo.
      const movidos = new Map(movimentos.map((m) => [m.card.id, m.paraFaseId]))
      await Promise.all(cards.map((c) => {
        const atualizado = movidos.has(c.id) ? { ...c, faseId: movidos.get(c.id)! } : c
        const saude = calcularSaude(atualizado, board.fases, hoje, fuso)
        return saude !== c.saude ? repo.atualizarCard(c.id, { saude }) : Promise.resolve()
      }))
      await qc.invalidateQueries({ queryKey: chaves.cards(board.id) })
      setUltima(agoraISO())
      if (movimentos.length) {
        notificar({ mensagem: movimentos.length === 1 ? `${movimentos[0]!.card.clienteNome} avançou de fase pelo tempo` : `${movimentos.length} clientes avançaram de fase pelo tempo` })
      } else if (avisarSemMudanca) {
        notificar({ mensagem: 'Fases recalculadas: nenhuma mudança.' })
      }
    } catch (erro) {
      console.error('[operacao-assistida] reconciliação falhou', erro)
      notificar({ mensagem: 'Não deu para recalcular as fases. Tente de novo.' })
    } finally {
      setExecutando(false)
    }
  }, [board, cards, executando, qc, notificar])

  // Ao carregar (uma vez, quando board e cards existirem)
  useEffect(() => {
    if (board && cards && !jaRodouAoCarregar.current) { jaRodouAoCarregar.current = true; executar() }
  }, [board, cards, executar])

  // À meia-noite do fuso do board
  useEffect(() => {
    if (!board) return
    const fuso = board.configuracoes.fusoHorario
    const n = agora(fuso)
    const proximaMeiaNoite = new Date(n); proximaMeiaNoite.setHours(24, 0, 5, 0)
    const ms = Math.max(1000, proximaMeiaNoite.getTime() - n.getTime())
    const t = setTimeout(() => executar(), ms)
    return () => clearTimeout(t)
  }, [board, executar, ultima])

  return { executar: () => executar(true), ultima, executando }
}
