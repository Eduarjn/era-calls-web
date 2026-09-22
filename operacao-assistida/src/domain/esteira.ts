/**
 * Regras de tempo da esteira — funções puras, sem efeito colateral.
 * A fase esperada é derivada dos dias decorridos desde `dataEntrada`
 * e da `duracaoDias` de cada fase (entrada + andamento). A fase de
 * conclusão nunca é atingida sozinha: o card fica "aguardando finalização".
 */
import type { Card, Fase, Saude } from './types'
import { diasDecorridos, diasEntre, hojeISO } from './datas'

export interface PosicaoEsperada {
  /** Fase em que o card deveria estar hoje (sempre uma fase da esteira, nunca a de conclusão). */
  faseId: string
  indice: number
  /** Passou do fim da esteira: precisa de finalização explícita. */
  aguardandoFinalizacao: boolean
  /** Dias decorridos desde a entrada. */
  diasDecorridos: number
}

export interface Movimento {
  card: Card
  deFaseId: string
  paraFaseId: string
}

/** Fases ativas ordenadas. */
export function fasesOrdenadas(fases: Fase[]): Fase[] {
  return fases.filter((f) => !f.arquivada).sort((a, b) => a.ordem - b.ordem)
}

/** Fases que compõem a esteira de tempo (tudo menos conclusão). */
export function fasesDaEsteira(fases: Fase[]): Fase[] {
  return fasesOrdenadas(fases).filter((f) => f.tipo !== 'conclusao')
}

export function faseEsperada(card: Card, fases: Fase[], hoje = hojeISO(), fuso?: string): PosicaoEsperada | null {
  const esteira = fasesDaEsteira(fases)
  if (esteira.length === 0) return null
  const dias = diasDecorridos(card.dataEntrada, hoje, fuso)

  let acumulado = 0
  for (let i = 0; i < esteira.length; i++) {
    const f = esteira[i]!
    // Uma fase sem auto-avanço é uma parede: chegou nela, fica.
    if (f.regraAutoAvanco.tipo === 'nunca') return { faseId: f.id, indice: i, aguardandoFinalizacao: false, diasDecorridos: dias }
    acumulado += Math.max(0, f.duracaoDias)
    if (dias < acumulado) return { faseId: f.id, indice: i, aguardandoFinalizacao: false, diasDecorridos: dias }
  }
  const ultima = esteira[esteira.length - 1]!
  return { faseId: ultima.id, indice: esteira.length - 1, aguardandoFinalizacao: true, diasDecorridos: dias }
}

/** Card em fase diferente da esperada (à frente ou atrás) — mostra o selo "fora da esteira". */
export function foraDaEsteira(card: Card, fases: Fase[], hoje = hojeISO(), fuso?: string): 'atras' | 'adiante' | null {
  if (card.status !== 'ativo' && card.status !== 'pausado') return null
  const esperada = faseEsperada(card, fases, hoje, fuso)
  if (!esperada || esperada.faseId === card.faseId) return null
  const esteira = fasesDaEsteira(fases)
  const atual = esteira.findIndex((f) => f.id === card.faseId)
  if (atual === -1) return null // está na conclusão ou numa fase fora da esteira
  return atual < esperada.indice ? 'atras' : 'adiante'
}

export function aguardandoFinalizacao(card: Card, fases: Fase[], hoje = hojeISO(), fuso?: string): boolean {
  if (card.status !== 'ativo') return false
  const esperada = faseEsperada(card, fases, hoje, fuso)
  return !!esperada && esperada.aguardandoFinalizacao && esperada.faseId === card.faseId
}

/**
 * Movimentos automáticos pendentes. Regras:
 * - só cards `ativo`, não fixados, e só se a automação do board estiver ligada;
 * - só para a frente (nunca volta sozinho);
 * - nunca entra na fase de conclusão;
 * - card adiantado manualmente fica onde está.
 */
export function reconciliar(cards: Card[], fases: Fase[], automacaoAtiva: boolean, hoje = hojeISO(), fuso?: string): Movimento[] {
  if (!automacaoAtiva) return []
  const esteira = fasesDaEsteira(fases)
  const movimentos: Movimento[] = []
  for (const card of cards) {
    if (card.status !== 'ativo' || card.travadoManualmente) continue
    const atual = esteira.findIndex((f) => f.id === card.faseId)
    if (atual === -1) continue
    const esperada = faseEsperada(card, fases, hoje, fuso)
    if (!esperada || esperada.indice <= atual) continue
    movimentos.push({ card, deFaseId: card.faseId, paraFaseId: esperada.faseId })
  }
  return movimentos
}

/**
 * Saúde calculada por regra (a manual, se existir, vence):
 * vermelho — ciclo vencido, ação atrasada há 2+ dias ou 3+ dias atrás da fase esperada;
 * amarelo  — ciclo vence em até 3 dias, ação hoje/atrasada, atrás da esteira, ou pausado;
 * verde    — o resto.
 */
export function calcularSaude(card: Card, fases: Fase[], hoje = hojeISO(), fuso?: string): Saude {
  if (card.saudeManual) return card.saudeManual
  if (card.status === 'finalizado' || card.status === 'cancelado') return 'verde'

  const diasCiclo = diasEntre(hoje, card.dataPrevistaSaida, fuso)
  const diasAcao = card.proximaAcao ? diasEntre(hoje, card.proximaAcao.dataPrazo, fuso) : null
  const posicao = foraDaEsteira(card, fases, hoje, fuso)
  const atrasoNaEsteira = posicao === 'atras' ? diasAtrasNaEsteira(card, fases, hoje, fuso) : 0

  if (diasCiclo < 0) return 'vermelho'
  if (diasAcao != null && diasAcao <= -2) return 'vermelho'
  if (atrasoNaEsteira >= 3) return 'vermelho'

  if (card.status === 'pausado') return 'amarelo'
  if (diasCiclo <= 3) return 'amarelo'
  if (diasAcao != null && diasAcao <= 0) return 'amarelo'
  if (posicao === 'atras') return 'amarelo'
  return 'verde'
}

/** Quantos dias o card já deveria ter saído da fase atual (0 se está em dia). */
export function diasAtrasNaEsteira(card: Card, fases: Fase[], hoje = hojeISO(), fuso?: string): number {
  const esteira = fasesDaEsteira(fases)
  const atual = esteira.findIndex((f) => f.id === card.faseId)
  if (atual === -1) return 0
  let fimDaAtual = 0
  for (let i = 0; i <= atual; i++) fimDaAtual += Math.max(0, esteira[i]!.duracaoDias)
  const dias = diasDecorridos(card.dataEntrada, hoje, fuso)
  return Math.max(0, dias - fimDaAtual + 1)
}

/** Duração total da esteira em dias (soma das fases de entrada e andamento). */
export function duracaoEsteira(fases: Fase[]): number {
  return fasesDaEsteira(fases).reduce((s, f) => s + Math.max(0, f.duracaoDias), 0)
}
