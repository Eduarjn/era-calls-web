import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/data'
import type { Board, Fase, TemplateBoard } from '@/domain/types'
import { useUI } from '@/store/uiStore'
import { chaves } from '@/features/board/useBoard'

/** Mutações de configuração do board (fases, templates, ajustes). Otimistas onde faz sentido. */
export function useConfigBoard(boardId: string) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  const chaveBoard = chaves.board(boardId)
  const invalidar = () => { qc.invalidateQueries({ queryKey: chaveBoard }); qc.invalidateQueries({ queryKey: chaves.boards }); qc.invalidateQueries({ queryKey: chaves.cards(boardId) }) }
  const erro = (msg: string) => () => notificar({ mensagem: msg })

  const atualizarFase = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<Fase, 'id' | 'boardId'>> }) => getRepository().atualizarFase(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: chaveBoard })
      const anterior = qc.getQueryData<Board>(chaveBoard)
      if (anterior) qc.setQueryData<Board>(chaveBoard, { ...anterior, fases: anterior.fases.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
      return anterior
    },
    onError: (_e, _v, anterior) => { if (anterior) qc.setQueryData(chaveBoard, anterior); notificar({ mensagem: 'Não deu para salvar a fase.' }) },
    onSettled: invalidar,
  })

  const criarFase = useMutation({
    mutationFn: (fase: Omit<Fase, 'id' | 'boardId'>) => getRepository().criarFase(boardId, fase),
    onSuccess: (f) => notificar({ mensagem: `Fase "${f.nome}" criada` }),
    onError: erro('Não deu para criar a fase.'),
    onSettled: invalidar,
  })

  const reordenar = useMutation({
    mutationFn: (ids: string[]) => getRepository().reordenarFases(boardId, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: chaveBoard })
      const anterior = qc.getQueryData<Board>(chaveBoard)
      if (anterior) qc.setQueryData<Board>(chaveBoard, { ...anterior, fases: anterior.fases.map((f) => ({ ...f, ordem: ids.indexOf(f.id) === -1 ? f.ordem : ids.indexOf(f.id) })) })
      return anterior
    },
    onError: (_e, _v, anterior) => { if (anterior) qc.setQueryData(chaveBoard, anterior); notificar({ mensagem: 'Não deu para reordenar.' }) },
    onSettled: invalidar,
  })

  const excluirFase = useMutation({
    mutationFn: ({ id, destinoId }: { id: string; destinoId: string | null }) => getRepository().excluirFase(id, destinoId),
    onSuccess: () => notificar({ mensagem: 'Fase excluída' }),
    onError: (e) => notificar({ mensagem: e instanceof Error ? e.message : 'Não deu para excluir a fase.' }),
    onSettled: invalidar,
  })

  const atualizarBoard = useMutation({
    mutationFn: (patch: Partial<Pick<Board, 'nome' | 'descricao' | 'configuracoes'>>) => getRepository().atualizarBoard(boardId, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: chaveBoard })
      const anterior = qc.getQueryData<Board>(chaveBoard)
      if (anterior) qc.setQueryData<Board>(chaveBoard, { ...anterior, ...patch, configuracoes: { ...anterior.configuracoes, ...(patch.configuracoes ?? {}) } })
      return anterior
    },
    onError: (_e, _v, anterior) => { if (anterior) qc.setQueryData(chaveBoard, anterior); notificar({ mensagem: 'Não deu para salvar as configurações.' }) },
    onSettled: invalidar,
  })

  const salvarTemplate = useMutation({
    mutationFn: (t: Omit<TemplateBoard, 'id'>) => getRepository().salvarTemplate(t),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ['templates'] }); notificar({ mensagem: `Template "${t.nome}" salvo` }) },
    onError: erro('Não deu para salvar o template.'),
  })

  const excluirTemplate = useMutation({
    mutationFn: (id: string) => getRepository().excluirTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })

  const criarBoard = useMutation({
    mutationFn: ({ nome, template }: { nome: string; template: TemplateBoard }) => getRepository().criarBoard(nome, template),
    onSuccess: (b) => { qc.invalidateQueries({ queryKey: chaves.boards }); useUI.getState().setBoardAtivo(b.id); notificar({ mensagem: `Quadro "${b.nome}" criado a partir do template` }) },
    onError: erro('Não deu para criar o quadro.'),
  })

  return { atualizarFase, criarFase, reordenar, excluirFase, atualizarBoard, salvarTemplate, excluirTemplate, criarBoard }
}
