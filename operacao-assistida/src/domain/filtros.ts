import type { Card, Filtros, Saude } from './types'
import { responsavelDigitado } from './cardExtras'
import { ehTip, filtroIntegracaoDo, SEM_VENDEDOR, vendedorDoCard } from './comercial'

/** Valor do filtro de responsável para quem não é usuário da plataforma. */
export const PREFIXO_NOME = 'nome:'

/** Aplica os filtros combináveis. A saúde vem calculada de fora (regra de tempo). */
export function aplicarFiltros(cards: Card[], f: Filtros, saudeDe: (c: Card) => Saude): Card[] {
  const busca = f.busca.trim().toLowerCase()
  return cards.filter((c) => {
    if (busca) {
      const alvo = [c.codigo, c.clienteNome, responsavelDigitado(c), c.segmento, c.produtoPlano, c.contatoPrincipal?.nome, c.contatoPrincipal?.email, vendedorDoCard(c), ehTip(c) ? 'TIP' : '', ...c.tags].filter(Boolean).join(' ').toLowerCase()
      if (!alvo.includes(busca)) return false
    }
    if (f.responsavelIds.length) {
      const digitado = responsavelDigitado(c)
      const chave = c.responsavelId ?? (digitado ? PREFIXO_NOME + digitado : '')
      if (!f.responsavelIds.includes(chave)) return false
    }
    if (f.faseIds.length && !f.faseIds.includes(c.faseId)) return false
    if (f.saudes.length && !f.saudes.includes(saudeDe(c))) return false
    if (f.prioridades.length && !f.prioridades.includes(c.prioridade)) return false
    if (f.tags.length && !f.tags.some((t) => c.tags.includes(t))) return false
    if (f.status.length && !f.status.includes(c.status)) return false
    if (f.vendedores?.length && !f.vendedores.includes(vendedorDoCard(c) ?? SEM_VENDEDOR)) return false
    if (f.origens?.length && !f.origens.includes(ehTip(c) ? 'tip' : 'interna')) return false
    if (f.integracoes?.length && !f.integracoes.includes(filtroIntegracaoDo(c))) return false
    if (f.entradaDe && c.dataEntrada.slice(0, 10) < f.entradaDe) return false
    if (f.entradaAte && c.dataEntrada.slice(0, 10) > f.entradaAte) return false
    return true
  })
}

export function filtrosAtivos(f: Filtros): number {
  return (f.busca ? 1 : 0) + f.responsavelIds.length + f.faseIds.length + f.saudes.length + f.prioridades.length + f.tags.length + f.status.length
    + (f.vendedores?.length ?? 0) + (f.origens?.length ?? 0) + (f.integracoes?.length ?? 0)
    + (f.entradaDe ? 1 : 0) + (f.entradaAte ? 1 : 0)
}
