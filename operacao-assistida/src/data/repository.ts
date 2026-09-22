import type {
  Board, Card, Evento, Fase, Id, NovoCard, NovoEvento, PatchCard, TemplateBoard, Usuario, VisaoSalva,
} from '@/domain/types'
import type { ConfigIntegracao } from '@/integrations/types'

/**
 * Contrato de persistência. A UI só conhece esta interface.
 * Implementações: MockRepository (memória, hoje) · SupabaseRepository (etapa de publicação).
 */
export interface Repository {
  // Usuários
  listarUsuarios(): Promise<Usuario[]>
  usuarioAtual(): Promise<Usuario | null>

  // Boards
  listarBoards(): Promise<Board[]>
  obterBoard(id: Id): Promise<Board | null>
  criarBoard(nome: string, template: TemplateBoard): Promise<Board>
  atualizarBoard(id: Id, patch: Partial<Pick<Board, 'nome' | 'descricao' | 'configuracoes'>>): Promise<Board>

  // Fases
  criarFase(boardId: Id, fase: Omit<Fase, 'id' | 'boardId'>): Promise<Fase>
  atualizarFase(id: Id, patch: Partial<Omit<Fase, 'id' | 'boardId'>>): Promise<Fase>
  reordenarFases(boardId: Id, idsEmOrdem: Id[]): Promise<Fase[]>
  excluirFase(id: Id, destinoCardsId: Id | null): Promise<void>

  // Cards
  listarCards(boardId: Id): Promise<Card[]>
  obterCard(id: Id): Promise<Card | null>
  criarCard(dados: NovoCard): Promise<Card>
  atualizarCard(id: Id, patch: PatchCard): Promise<Card>
  excluirCard(id: Id): Promise<void>

  // Histórico
  listarEventos(cardId: Id): Promise<Evento[]>
  /** Todos os eventos dos cards de um board (painel / calendário). */
  listarEventosDoBoard(boardId: Id): Promise<Evento[]>
  criarEvento(dados: NovoEvento): Promise<Evento>
  excluirEvento(id: Id): Promise<void>

  // Templates
  listarTemplates(): Promise<TemplateBoard[]>
  salvarTemplate(template: Omit<TemplateBoard, 'id'>): Promise<TemplateBoard>
  excluirTemplate(id: Id): Promise<void>

  // Visões salvas
  listarVisoes(boardId: Id): Promise<VisaoSalva[]>
  salvarVisao(visao: Omit<VisaoSalva, 'id' | 'criadoEm'>): Promise<VisaoSalva>
  excluirVisao(id: Id): Promise<void>

  // Integração (configuração por board — a credencial NUNCA passa por aqui)
  obterConfigIntegracao(boardId: Id): Promise<ConfigIntegracao>
  salvarConfigIntegracao(config: ConfigIntegracao): Promise<ConfigIntegracao>
}

export class RepositoryError extends Error {
  constructor(message: string, public readonly causa?: unknown) {
    super(message)
    this.name = 'RepositoryError'
  }
}
