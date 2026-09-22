/**
 * Modelo de dados da Operação Assistida.
 * Datas são sempre ISO 8601 (string) — a aritmética fica em domain/datas.ts (date-fns + fuso).
 */

export type ISODate = string
export type Id = string

// ---------- Usuário ----------
export interface Usuario {
  id: Id
  nome: string
  email: string
  papel?: string
}

// ---------- Board ----------
export interface ConfiguracoesBoard {
  /** Duração padrão do ciclo em dias (dataPrevistaSaida = dataEntrada + ciclo). */
  duracaoCicloDias: number
  /** Liga/desliga o auto-avanço por tempo em todo o board. */
  automacaoAtiva: boolean
  /** IANA, ex.: America/Sao_Paulo. */
  fusoHorario: string
  /** Campos extras que todo card do board pode preencher. */
  camposCustomizados?: CampoCustomizado[]
}

export interface Board {
  id: Id
  nome: string
  descricao?: string
  fases: Fase[]
  configuracoes: ConfiguracoesBoard
  criadoEm: ISODate
  atualizadoEm: ISODate
}

// ---------- Fase (coluna) ----------
export type TipoFase = 'entrada' | 'andamento' | 'conclusao'

export type RegraAutoAvanco =
  | { tipo: 'nunca' }
  | { tipo: 'apos_dias_na_fase' }        // avança quando completar `duracaoDias` na fase
  | { tipo: 'na_data_alvo' }             // avança quando atingir a data-alvo calculada pela esteira

export interface ChecklistItem {
  id: Id
  texto: string
  feito: boolean
  feitoEm?: ISODate
  feitoPor?: Id
}

export interface Fase {
  id: Id
  boardId: Id
  nome: string
  ordem: number
  /** Hex ou token CSS. Usada na borda esquerda do card e no cabeçalho da coluna. */
  cor: string
  tipo: TipoFase
  duracaoDias: number
  regraAutoAvanco: RegraAutoAvanco
  limiteWIP?: number
  /** Itens que todo card recebe ao entrar nesta fase. */
  checklistPadrao: string[]
  arquivada: boolean
}

// ---------- Card ----------
export type StatusCard = 'ativo' | 'pausado' | 'finalizado' | 'cancelado'
export type ResultadoFinal = 'estabilizado' | 'prorrogado' | 'escalado' | 'churn'
export type Prioridade = 'baixa' | 'media' | 'alta' | 'critica'
export type Saude = 'verde' | 'amarelo' | 'vermelho'

export interface Contato {
  nome: string
  email?: string
  telefone?: string
}

export interface Anexo {
  id: Id
  nome: string
  url: string
  tipo?: string
  tamanhoBytes?: number
  criadoEm: ISODate
}

export interface ProximaAcao {
  descricao: string
  dataPrazo: ISODate
  responsavelId?: Id
}

export interface Card {
  id: Id
  boardId: Id
  /** Sequencial legível, ex.: OA-0042. */
  codigo: string
  clienteNome: string
  /** Id externo (ex.: Movidesk). */
  clienteId?: string
  contatoPrincipal?: Contato
  segmento?: string
  produtoPlano?: string

  responsavelId?: Id
  coResponsaveisIds: Id[]

  dataEntrada: ISODate
  dataPrevistaSaida: ISODate
  dataSaidaReal?: ISODate

  faseId: Id
  dataEntradaNaFase: ISODate

  status: StatusCard
  resultadoFinal?: ResultadoFinal
  justificativaResultado?: string

  prioridade: Prioridade
  /** Calculada por regra; se `saudeManual` estiver definida, ela vence. */
  saude: Saude
  saudeManual?: Saude

  tags: string[]
  /** Impede o auto-avanço por tempo. */
  travadoManualmente: boolean
  checklist: ChecklistItem[]
  anexos: Anexo[]
  camposCustomizados: Record<string, string | number | boolean | null>
  proximaAcao?: ProximaAcao

  criadoEm: ISODate
  atualizadoEm: ISODate
}

// ---------- Evento de histórico (acionamento) ----------
export type TipoEvento =
  | 'ligacao' | 'email' | 'reuniao' | 'ticket' | 'whatsapp' | 'nota'
  | 'mudanca_de_fase' | 'sistema'

export type OrigemEvento = 'manual' | 'integracao'

export interface Evento {
  id: Id
  cardId: Id
  tipo: TipoEvento
  titulo: string
  /** Texto rico simples (markdown leve). */
  descricao?: string
  dataHora: ISODate
  autorId?: Id
  /** Nome do autor no momento do registro (para eventos de sistema e de integração). */
  autorNome?: string
  duracaoMin?: number
  anexos: Anexo[]
  linkExterno?: string
  origem: OrigemEvento
  /** Eventos gerados pela plataforma (mudança de fase, entrada, finalização, prazo). */
  geradoPeloSistema: boolean
  /** Dados estruturados do evento (ex.: { deFaseId, paraFaseId }). */
  meta?: Record<string, unknown>
}

// ---------- Filtros e visões salvas ----------
export type Visao = 'kanban' | 'lista' | 'timeline' | 'calendario' | 'painel'

export interface Filtros {
  busca: string
  responsavelIds: Id[]
  faseIds: Id[]
  saudes: Saude[]
  prioridades: Prioridade[]
  tags: string[]
  status: StatusCard[]
  /** Período da data de entrada (ISO yyyy-MM-dd). */
  entradaDe?: string
  entradaAte?: string
}

export const FILTROS_VAZIOS: Filtros = {
  busca: '', responsavelIds: [], faseIds: [], saudes: [], prioridades: [], tags: [], status: [],
}

export interface VisaoSalva {
  id: Id
  boardId: Id
  nome: string
  visao: Visao
  filtros: Filtros
  criadoEm: ISODate
}

// ---------- Campos customizados (definição no board) ----------
export interface CampoCustomizado {
  chave: string
  rotulo: string
  tipo: 'texto' | 'numero' | 'data' | 'booleano' | 'lista'
  opcoes?: string[]
}

// ---------- Template de board ----------
export interface TemplateBoard {
  id: Id
  nome: string
  descricao?: string
  configuracoes: ConfiguracoesBoard
  fases: Omit<Fase, 'id' | 'boardId'>[]
}

// ---------- Entradas de mutação ----------
export type NovoCard = Pick<Card, 'clienteNome' | 'faseId'> &
  Partial<Omit<Card, 'id' | 'codigo' | 'criadoEm' | 'atualizadoEm' | 'boardId'>> & { boardId: Id }

export type PatchCard = Partial<Omit<Card, 'id' | 'boardId' | 'codigo' | 'criadoEm'>>

export type NovoEvento = Omit<Evento, 'id' | 'anexos' | 'geradoPeloSistema'> &
  Partial<Pick<Evento, 'anexos' | 'geradoPeloSistema'>>
