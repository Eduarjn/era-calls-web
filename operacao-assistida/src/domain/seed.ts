import type { ConfiguracoesBoard, Fase, TemplateBoard } from './types'
import { FUSO_PADRAO } from './datas'

/**
 * Cores das fases: cada etapa tem uma cor própria e bem distinta (azul → ciano → verde → roxo).
 * Vermelho/âmbar ficam reservados para prazo e saúde — nunca para uma fase.
 */
export const CORES_FASE = {
  entrada: '#447BBE',   // azul — acabou de chegar
  semana1: '#0EA5B7',   // ciano — primeira semana
  semana2: '#22A559',   // verde — segunda semana, ganhando autonomia
  semana3: '#1F8F6E',   // verde-água (templates longos)
  semana4: '#0E8A52',   // verde escuro (templates longos)
  conclusao: '#7C5CE0', // roxo — encerramento
} as const

export const PALETA_FASES: string[] = [
  CORES_FASE.entrada, CORES_FASE.semana1, CORES_FASE.semana2, CORES_FASE.semana3,
  CORES_FASE.semana4, CORES_FASE.conclusao, '#C026D3', '#B8730D', '#C0161F', '#6A7186',
]

/** Cores que o usuário pode escolher para destacar um card (guardada em camposCustomizados._cor). */
export const CORES_CARD: { nome: string; cor: string }[] = [
  { nome: 'Azul', cor: '#3B82F6' }, { nome: 'Ciano', cor: '#06B6D4' }, { nome: 'Verde', cor: '#22C55E' },
  { nome: 'Amarelo', cor: '#EAB308' }, { nome: 'Laranja', cor: '#F97316' }, { nome: 'Vermelho', cor: '#EF4444' },
  { nome: 'Rosa', cor: '#EC4899' }, { nome: 'Roxo', cor: '#8B5CF6' }, { nome: 'Cinza', cor: '#94A3B8' },
]

/**
 * Kick-off dura 1 semana: é o acompanhamento preliminar antes de o cliente ir para a Semana 1
 * (pedido do Eduardo, 02/10/2026; antes eram 2 dias).
 */
export const KICKOFF_DIAS = 7

/** Kick-off (7 d) + Semana 1 (7 d) + Semana 2 (7 d). */
export const CICLO_2_SEMANAS = 21

/**
 * Marca em configuracoes.esteiraVersao: quadro já revisado, o ajuste automático da esteira não mexe nele.
 * '2s' = Kick-off + 2 semanas com kick-off de 2 dias (24/09) · '2s-k7' = kick-off de 1 semana (02/10).
 */
export const ESTEIRA_REVISADA = '2s-k7'
export const ESTEIRA_2S_ANTIGA = '2s'

export const CONFIG_PADRAO: ConfiguracoesBoard = {
  duracaoCicloDias: CICLO_2_SEMANAS,
  automacaoAtiva: true,
  fusoHorario: FUSO_PADRAO,
}

type FaseSemId = Omit<Fase, 'id' | 'boardId'>

/** Esteira de 30 dias: Entrada / Kick-off → Semana 1..4 → Finalização (template alternativo e testes). */
export const FASES_PADRAO_30D: FaseSemId[] = [
  {
    nome: 'Entrada / Kick-off', ordem: 0, cor: CORES_FASE.entrada, tipo: 'entrada',
    duracaoDias: 2, regraAutoAvanco: { tipo: 'apos_dias_na_fase' },
    checklistPadrao: ['Reunião de kick-off realizada', 'Contato principal confirmado', 'Acessos validados'],
    arquivada: false,
  },
  {
    nome: 'Semana 1', ordem: 1, cor: CORES_FASE.semana1, tipo: 'andamento',
    duracaoDias: 7, regraAutoAvanco: { tipo: 'apos_dias_na_fase' },
    checklistPadrao: ['Primeiro acionamento de acompanhamento', 'Uso da plataforma confirmado'],
    arquivada: false,
  },
  {
    nome: 'Semana 2', ordem: 2, cor: CORES_FASE.semana2, tipo: 'andamento',
    duracaoDias: 7, regraAutoAvanco: { tipo: 'apos_dias_na_fase' },
    checklistPadrao: ['Acionamento semanal registrado'],
    arquivada: false,
  },
  {
    nome: 'Semana 3', ordem: 3, cor: CORES_FASE.semana3, tipo: 'andamento',
    duracaoDias: 7, regraAutoAvanco: { tipo: 'apos_dias_na_fase' },
    checklistPadrao: ['Acionamento semanal registrado', 'Pendências mapeadas'],
    arquivada: false,
  },
  {
    nome: 'Semana 4', ordem: 4, cor: CORES_FASE.semana4, tipo: 'andamento',
    duracaoDias: 7, regraAutoAvanco: { tipo: 'apos_dias_na_fase' },
    checklistPadrao: ['Acionamento semanal registrado', 'Reunião de encerramento agendada'],
    arquivada: false,
  },
  {
    nome: 'Finalização', ordem: 5, cor: CORES_FASE.conclusao, tipo: 'conclusao',
    duracaoDias: 0, regraAutoAvanco: { tipo: 'nunca' },
    checklistPadrao: ['Desfecho registrado', 'Cliente comunicado do encerramento'],
    arquivada: false,
  },
]

/** Esteira padrão (desde 24/09/2026): Entrada / Kick-off (1 semana) → Semana 1 → Semana 2 → Finalização. */
export const FASES_PADRAO_2S: FaseSemId[] = [
  { ...FASES_PADRAO_30D[0]!, duracaoDias: KICKOFF_DIAS },
  { ...FASES_PADRAO_30D[1]!, cor: CORES_FASE.semana1 },
  {
    ...FASES_PADRAO_30D[2]!, cor: CORES_FASE.semana2,
    checklistPadrao: ['Acionamento semanal registrado', 'Pendências mapeadas', 'Reunião de encerramento agendada'],
  },
  { ...FASES_PADRAO_30D[5]!, ordem: 3, cor: CORES_FASE.conclusao },
]

export const DESCRICAO_2S = 'Kick-off (1 semana) + 2 semanas + finalização. Auto-avanço ligado.'

export const TEMPLATES_PADRAO: TemplateBoard[] = [
  {
    id: 'tpl-2s',
    nome: 'Operação assistida 2 semanas',
    descricao: DESCRICAO_2S,
    configuracoes: { ...CONFIG_PADRAO, esteiraVersao: ESTEIRA_REVISADA },
    fases: FASES_PADRAO_2S,
  },
  {
    id: 'tpl-30d',
    nome: 'Operação assistida 30 dias',
    descricao: 'Kick-off + 4 semanas + finalização. Auto-avanço ligado.',
    configuracoes: { ...CONFIG_PADRAO, duracaoCicloDias: 30, esteiraVersao: ESTEIRA_REVISADA },
    fases: FASES_PADRAO_30D,
  },
  {
    id: 'tpl-60d',
    nome: 'Operação assistida 60 dias',
    descricao: 'Kick-off + 8 semanas + finalização.',
    configuracoes: { ...CONFIG_PADRAO, duracaoCicloDias: 60, esteiraVersao: ESTEIRA_REVISADA },
    fases: [
      FASES_PADRAO_30D[0],
      ...Array.from({ length: 8 }, (_, i): FaseSemId => ({
        nome: `Semana ${i + 1}`, ordem: i + 1,
        cor: i < 3 ? CORES_FASE.semana1 : i < 6 ? CORES_FASE.semana3 : CORES_FASE.semana4,
        tipo: 'andamento', duracaoDias: 7, regraAutoAvanco: { tipo: 'apos_dias_na_fase' },
        checklistPadrao: ['Acionamento semanal registrado'], arquivada: false,
      })),
      { ...FASES_PADRAO_30D[5], ordem: 9 },
    ],
  },
]
