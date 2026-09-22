import type { ConfiguracoesBoard, Fase, TemplateBoard } from './types'
import { FUSO_PADRAO } from './datas'

/**
 * Cores das fases: a jornada vai do azul (chegou) ao verde (estável) e fecha em roxo (concluído).
 * Vermelho/âmbar ficam reservados para prazo e saúde — nunca para uma fase.
 */
export const CORES_FASE = {
  entrada: '#447BBE',   // aço — acabou de chegar
  semana1: '#2F62B8',   // azul
  semana2: '#2B3784',   // navy
  semana3: '#1F8F6E',   // verde-água — ganhando autonomia
  semana4: '#0E8A52',   // verde — estável
  conclusao: '#6B5BD2', // roxo — encerramento
} as const

export const PALETA_FASES: string[] = [
  CORES_FASE.entrada, CORES_FASE.semana1, CORES_FASE.semana2, CORES_FASE.semana3,
  CORES_FASE.semana4, CORES_FASE.conclusao, '#B8730D', '#C0161F', '#6A7186',
]

export const CONFIG_PADRAO: ConfiguracoesBoard = {
  duracaoCicloDias: 30,
  automacaoAtiva: true,
  fusoHorario: FUSO_PADRAO,
}

type FaseSemId = Omit<Fase, 'id' | 'boardId'>

/** Esteira padrão: Entrada / Kick-off → Semana 1..4 → Finalização. */
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

export const TEMPLATES_PADRAO: TemplateBoard[] = [
  {
    id: 'tpl-30d',
    nome: 'Operação assistida 30 dias',
    descricao: 'Kick-off + 4 semanas + finalização. Auto-avanço ligado.',
    configuracoes: CONFIG_PADRAO,
    fases: FASES_PADRAO_30D,
  },
  {
    id: 'tpl-60d',
    nome: 'Operação assistida 60 dias',
    descricao: 'Kick-off + 8 semanas + finalização.',
    configuracoes: { ...CONFIG_PADRAO, duracaoCicloDias: 60 },
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
