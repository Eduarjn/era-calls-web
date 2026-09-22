import type { Card, Prioridade, Saude } from './types'
import { diasEntre, hojeISO } from './datas'

export type CorPrazo = 'verde' | 'amarelo' | 'vermelho' | 'neutro'

export interface BadgePrazo {
  cor: CorPrazo
  /** Texto curto para o card, ex.: "faltam 3 d", "vence hoje", "2 d atrasado". */
  rotulo: string
  dias: number
}

/**
 * Badge de prazo do card (referência: fim previsto do ciclo).
 * verde = mais de 3 dias · amarelo = 0 a 3 dias · vermelho = vencido.
 */
export function badgePrazo(card: Card, hoje = hojeISO(), fuso?: string): BadgePrazo {
  if (card.status === 'finalizado' || card.status === 'cancelado') return { cor: 'neutro', rotulo: 'encerrado', dias: 0 }
  const dias = diasEntre(hoje, card.dataPrevistaSaida, fuso)
  if (dias < 0) return { cor: 'vermelho', rotulo: `${-dias} d atrasado`, dias }
  if (dias === 0) return { cor: 'amarelo', rotulo: 'vence hoje', dias }
  if (dias <= 3) return { cor: 'amarelo', rotulo: `faltam ${dias} d`, dias }
  return { cor: 'verde', rotulo: `faltam ${dias} d`, dias }
}

/** Badge da próxima ação (se houver). */
export function badgeProximaAcao(card: Card, hoje = hojeISO(), fuso?: string): BadgePrazo | null {
  if (!card.proximaAcao) return null
  const dias = diasEntre(hoje, card.proximaAcao.dataPrazo, fuso)
  if (dias < 0) return { cor: 'vermelho', rotulo: 'ação atrasada', dias }
  if (dias === 0) return { cor: 'amarelo', rotulo: 'ação hoje', dias }
  if (dias === 1) return { cor: 'amarelo', rotulo: 'ação amanhã', dias }
  return { cor: 'verde', rotulo: `ação em ${dias} d`, dias }
}

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica',
}
export const ROTULO_SAUDE: Record<Saude, string> = { verde: 'Saudável', amarelo: 'Atenção', vermelho: 'Em risco' }

export function iniciais(nome: string): string {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}
