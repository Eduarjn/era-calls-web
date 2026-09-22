import { format } from 'date-fns'
import type { Card, Fase } from './types'
import { noFuso, somarDiasISO } from './datas'
import { fasesDaEsteira } from './esteira'

export type TipoEventoCalendario = 'entrada' | 'saida' | 'saida_prevista' | 'acao' | 'fase'

export interface EventoCalendario {
  /** yyyy-MM-dd no fuso do board. */
  dia: string
  tipo: TipoEventoCalendario
  cardId: string
  titulo: string
  cor: string
}

export const COR_EVENTO_CAL: Record<TipoEventoCalendario, string> = {
  entrada: '#2F62B8',        // azul — entrou
  saida: '#6B5BD2',          // roxo — finalizado
  saida_prevista: '#0E8A52', // verde — saída prevista
  acao: '#B8730D',           // âmbar — prazo de ação
  fase: '#6A7186',           // cinza — vencimento de fase
}

export const ROTULO_EVENTO_CAL: Record<TipoEventoCalendario, string> = {
  entrada: 'Entrada', saida: 'Saída', saida_prevista: 'Saída prevista', acao: 'Próxima ação', fase: 'Troca de fase',
}

const dia = (iso: string, fuso: string) => format(noFuso(iso, fuso), 'yyyy-MM-dd')

/** Deriva todos os marcos de calendário a partir dos cards (função pura). */
export function eventosDoCalendario(cards: Card[], fases: Fase[], fuso: string): EventoCalendario[] {
  const esteira = fasesDaEsteira(fases)
  const out: EventoCalendario[] = []
  for (const c of cards) {
    if (c.status === 'cancelado') continue
    out.push({ dia: dia(c.dataEntrada, fuso), tipo: 'entrada', cardId: c.id, titulo: c.clienteNome, cor: COR_EVENTO_CAL.entrada })
    if (c.status === 'finalizado' && c.dataSaidaReal) {
      out.push({ dia: dia(c.dataSaidaReal, fuso), tipo: 'saida', cardId: c.id, titulo: `${c.clienteNome} · ${c.resultadoFinal ?? 'finalizado'}`, cor: COR_EVENTO_CAL.saida })
    } else if (c.status !== 'finalizado') {
      out.push({ dia: dia(c.dataPrevistaSaida, fuso), tipo: 'saida_prevista', cardId: c.id, titulo: c.clienteNome, cor: COR_EVENTO_CAL.saida_prevista })
      if (c.proximaAcao) out.push({ dia: dia(c.proximaAcao.dataPrazo, fuso), tipo: 'acao', cardId: c.id, titulo: `${c.clienteNome}: ${c.proximaAcao.descricao}`, cor: COR_EVENTO_CAL.acao })
      // vencimentos das fases (limites acumulados da esteira a partir da entrada)
      let acumulado = 0
      for (let i = 0; i < esteira.length - 1; i++) {
        acumulado += Math.max(0, esteira[i]!.duracaoDias)
        out.push({ dia: dia(somarDiasISO(c.dataEntrada, acumulado, fuso), fuso), tipo: 'fase', cardId: c.id, titulo: `${c.clienteNome} → ${esteira[i + 1]!.nome}`, cor: esteira[i + 1]!.cor })
      }
    }
  }
  return out
}

export interface ContadorDia { entradas: number; saidas: number }

/** Entradas × saídas (reais + previstas) por dia. */
export function contarPorDia(eventos: EventoCalendario[]): Map<string, ContadorDia> {
  const m = new Map<string, ContadorDia>()
  for (const e of eventos) {
    const c = m.get(e.dia) ?? { entradas: 0, saidas: 0 }
    if (e.tipo === 'entrada') c.entradas++
    if (e.tipo === 'saida' || e.tipo === 'saida_prevista') c.saidas++
    m.set(e.dia, c)
  }
  return m
}
