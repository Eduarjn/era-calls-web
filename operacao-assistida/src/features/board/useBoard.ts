import { useQuery } from '@tanstack/react-query'
import { getRepository } from '@/data'

export const chaves = {
  boards: ['boards'] as const,
  board: (id: string) => ['board', id] as const,
  cards: (boardId: string) => ['cards', boardId] as const,
  usuarios: ['usuarios'] as const,
}

export function useBoards() {
  return useQuery({ queryKey: chaves.boards, queryFn: () => getRepository().listarBoards() })
}

export function useBoard(id: string | undefined) {
  return useQuery({
    queryKey: chaves.board(id ?? ''),
    queryFn: () => getRepository().obterBoard(id!),
    enabled: !!id,
  })
}

export function useCards(boardId: string | undefined) {
  return useQuery({
    queryKey: chaves.cards(boardId ?? ''),
    queryFn: () => getRepository().listarCards(boardId!),
    enabled: !!boardId,
  })
}

export function useUsuarioAtual() {
  return useQuery({ queryKey: ['usuario-atual'], queryFn: () => getRepository().usuarioAtual(), staleTime: Infinity })
}

/** Papel de quem está logado: gestor = administrador; visualizador = só vê (o banco também bloqueia a escrita). */
export function usePermissao() {
  const eu = useUsuarioAtual()
  return { carregado: !!eu.data, admin: eu.data?.papel === 'gestor', somenteLeitura: eu.data?.papel === 'visualizador' }
}

export function useUsuarios() {
  return useQuery({ queryKey: chaves.usuarios, queryFn: () => getRepository().listarUsuarios(), staleTime: 5 * 60_000 })
}
