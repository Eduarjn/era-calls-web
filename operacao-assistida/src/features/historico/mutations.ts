import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/data'
import type { Evento, NovoEvento } from '@/domain/types'
import { useUI } from '@/store/uiStore'

export const chaveEventos = (cardId: string) => ['eventos', cardId] as const

/** Registrar acionamento — otimista: aparece na timeline na hora, com rollback em erro. */
export function useCriarEvento(cardId: string) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  const chave = chaveEventos(cardId)
  return useMutation({
    mutationFn: (dados: NovoEvento) => getRepository().criarEvento(dados),
    onMutate: async (dados) => {
      await qc.cancelQueries({ queryKey: chave })
      const anterior = qc.getQueryData<Evento[]>(chave) ?? []
      const provisorio: Evento = { anexos: [], geradoPeloSistema: false, ...dados, id: 'tmp-' + Date.now() }
      qc.setQueryData<Evento[]>(chave, [provisorio, ...anterior])
      return anterior
    },
    onError: (_e, _v, anterior) => {
      if (anterior) qc.setQueryData(chave, anterior)
      notificar({ mensagem: 'Não deu para registrar o acionamento. Tente de novo.' })
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: chave }); qc.invalidateQueries({ queryKey: ['eventos-board'] }) },
  })
}

export function useExcluirEvento(cardId: string) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  const chave = chaveEventos(cardId)
  const criar = useCriarEvento(cardId)
  return useMutation({
    mutationFn: (evento: Evento) => getRepository().excluirEvento(evento.id),
    onMutate: async (evento) => {
      await qc.cancelQueries({ queryKey: chave })
      const anterior = qc.getQueryData<Evento[]>(chave) ?? []
      qc.setQueryData<Evento[]>(chave, anterior.filter((e) => e.id !== evento.id))
      return anterior
    },
    onError: (_e, _v, anterior) => { if (anterior) qc.setQueryData(chave, anterior); notificar({ mensagem: 'Não deu para excluir o registro.' }) },
    onSuccess: (_r, evento) => notificar({
      mensagem: 'Registro excluído',
      acao: { rotulo: 'Desfazer', executar: () => { const { id: _id, ...resto } = evento; criar.mutate(resto) } },
    }),
    onSettled: () => { qc.invalidateQueries({ queryKey: chave }); qc.invalidateQueries({ queryKey: ['eventos-board'] }) },
  })
}
