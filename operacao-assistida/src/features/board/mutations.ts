import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/data'
import type { Card, Fase, NovoCard, PatchCard } from '@/domain/types'
import { faseEsperada } from '@/domain/esteira'
import { useUI } from '@/store/uiStore'
import { chaves } from './useBoard'

const agoraISO = () => new Date().toISOString()

/** Atualização otimista genérica de um card na lista do board, com rollback em erro. */
function useOtimista(boardId: string) {
  const qc = useQueryClient()
  const chave = chaves.cards(boardId)
  return {
    qc,
    chave,
    aplicar: async (fn: (cards: Card[]) => Card[]) => {
      await qc.cancelQueries({ queryKey: chave })
      const anterior = qc.getQueryData<Card[]>(chave) ?? []
      qc.setQueryData<Card[]>(chave, fn(anterior))
      return anterior
    },
    reverter: (anterior: Card[] | undefined) => { if (anterior) qc.setQueryData(chave, anterior) },
    invalidar: () => { qc.invalidateQueries({ queryKey: chave }); qc.invalidateQueries({ queryKey: ['eventos-board'] }) },
  }
}

/** Mover card de fase — otimista, com evento de sistema e undo. */
export function useMoverCard(boardId: string, fases: Fase[]) {
  const o = useOtimista(boardId)
  const notificar = useUI((s) => s.notificar)

  const mutation = useMutation({
    mutationFn: async ({ card, paraFaseId, silencioso }: { card: Card; paraFaseId: string; silencioso?: boolean }) => {
      const repo = getRepository()
      const de = fases.find((f) => f.id === card.faseId)
      const para = fases.find((f) => f.id === paraFaseId)
      // Movimento manual fixa o card: senão a reconciliação por tempo o devolve à fase esperada no próximo carregamento.
      // Levado de volta à fase esperada, volta a seguir a esteira sozinho.
      const travadoManualmente = faseEsperada(card, fases)?.faseId !== paraFaseId
      const atualizado = await repo.atualizarCard(card.id, { faseId: paraFaseId, dataEntradaNaFase: agoraISO(), travadoManualmente })
      await repo.criarEvento({
        cardId: card.id, tipo: 'mudanca_de_fase',
        titulo: `Movido de ${de?.nome ?? '—'} para ${para?.nome ?? '—'}`,
        dataHora: agoraISO(), autorNome: 'Você', origem: 'manual', geradoPeloSistema: true,
        meta: { deFaseId: card.faseId, paraFaseId, manual: true },
      })
      return { atualizado, silencioso }
    },
    onMutate: async ({ card, paraFaseId }) =>
      o.aplicar((cards) => cards.map((c) => (c.id === card.id ? { ...c, faseId: paraFaseId, dataEntradaNaFase: agoraISO(), travadoManualmente: faseEsperada(card, fases)?.faseId !== paraFaseId } : c))),
    onError: (_e, _v, anterior) => {
      o.reverter(anterior)
      notificar({ mensagem: 'Não deu para mover o cliente. Tente de novo.' })
    },
    onSuccess: ({ atualizado, silencioso }, { card }) => {
      if (silencioso) return
      const para = fases.find((f) => f.id === atualizado.faseId)
      notificar({
        mensagem: `${card.clienteNome} → ${para?.nome ?? ''}`,
        acao: { rotulo: 'Desfazer', executar: () => mutation.mutate({ card: atualizado, paraFaseId: card.faseId, silencioso: true }) },
      })
    },
    onSettled: () => o.invalidar(),
  })
  return mutation
}

export function useCriarCard(boardId: string) {
  const o = useOtimista(boardId)
  const notificar = useUI((s) => s.notificar)
  return useMutation({
    mutationFn: (dados: NovoCard) => getRepository().criarCard(dados),
    onError: () => notificar({ mensagem: 'Não deu para criar o cliente. Tente de novo.' }),
    onSuccess: (novo) => { o.qc.setQueryData<Card[]>(o.chave, (cards = []) => [...cards, novo]) },
    onSettled: () => o.invalidar(),
  })
}

export function useAtualizarCard(boardId: string) {
  const o = useOtimista(boardId)
  const notificar = useUI((s) => s.notificar)
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchCard }) => getRepository().atualizarCard(id, patch),
    onMutate: async ({ id, patch }) =>
      o.aplicar((cards) => cards.map((c) => (c.id === id ? { ...c, ...patch, atualizadoEm: agoraISO() } : c))),
    onError: (_e, _v, anterior) => { o.reverter(anterior); notificar({ mensagem: 'Não deu para salvar. Tente de novo.' }) },
    onSettled: () => o.invalidar(),
  })
}

/** Finalizar: status, desfecho, data de saída e movimentação para a fase de conclusão (se houver). */
export function useFinalizarCard(boardId: string, fases: Fase[]) {
  const o = useOtimista(boardId)
  const notificar = useUI((s) => s.notificar)
  const conclusao = fases.find((f) => f.tipo === 'conclusao' && !f.arquivada)
  return useMutation({
    mutationFn: async ({ card, resultadoFinal, justificativa, dataSaidaReal }: { card: Card; resultadoFinal: NonNullable<Card['resultadoFinal']>; justificativa: string; dataSaidaReal: string }) => {
      const repo = getRepository()
      const atualizado = await repo.atualizarCard(card.id, {
        status: 'finalizado', resultadoFinal, justificativaResultado: justificativa, dataSaidaReal,
        faseId: conclusao?.id ?? card.faseId, dataEntradaNaFase: agoraISO(), saudeManual: undefined,
      })
      await repo.criarEvento({
        cardId: card.id, tipo: 'sistema', titulo: `Finalizado como ${resultadoFinal}`, descricao: justificativa,
        dataHora: agoraISO(), autorNome: 'Você', origem: 'manual', geradoPeloSistema: true,
        meta: { resultadoFinal, dataSaidaReal },
      })
      return atualizado
    },
    onMutate: async ({ card, resultadoFinal, justificativa, dataSaidaReal }) =>
      o.aplicar((cards) => cards.map((c) => (c.id === card.id ? { ...c, status: 'finalizado', resultadoFinal, justificativaResultado: justificativa, dataSaidaReal, faseId: conclusao?.id ?? c.faseId } : c))),
    onError: (_e, _v, anterior) => { o.reverter(anterior); notificar({ mensagem: 'Não deu para finalizar. Tente de novo.' }) },
    onSuccess: (_r, { card }) => notificar({ mensagem: `${card.clienteNome} finalizado` }),
    onSettled: () => o.invalidar(),
  })
}

export function useExcluirCard(boardId: string) {
  const o = useOtimista(boardId)
  const notificar = useUI((s) => s.notificar)
  const criar = useCriarCard(boardId)
  return useMutation({
    mutationFn: (card: Card) => getRepository().excluirCard(card.id),
    onMutate: async (card) => o.aplicar((cards) => cards.filter((c) => c.id !== card.id)),
    onError: (_e, _c, anterior) => { o.reverter(anterior); notificar({ mensagem: 'Não deu para excluir.' }) },
    onSuccess: (_r, card) => notificar({
      mensagem: `${card.clienteNome} excluído`,
      acao: { rotulo: 'Desfazer', executar: () => criar.mutate({ ...card, boardId: card.boardId }) },
    }),
    onSettled: () => o.invalidar(),
  })
}
