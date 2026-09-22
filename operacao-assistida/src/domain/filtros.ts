import type { Card, Filtros, Saude } from './types'

/** Aplica os filtros combináveis. A saúde vem calculada de fora (regra de tempo). */
export function aplicarFiltros(cards: Card[], f: Filtros, saudeDe: (c: Card) => Saude): Card[] {
  const busca = f.busca.trim().toLowerCase()
  return cards.filter((c) => {
    if (busca) {
      const alvo = [c.codigo, c.clienteNome, c.segmento, c.produtoPlano, c.contatoPrincipal?.nome, c.contatoPrincipal?.email, ...c.tags].filter(Boolean).join(' ').toLowerCase()
      if (!alvo.includes(busca)) return false
    }
    if (f.responsavelIds.length && !f.responsavelIds.includes(c.responsavelId ?? '')) return false
    if (f.faseIds.length && !f.faseIds.includes(c.faseId)) return false
    if (f.saudes.length && !f.saudes.includes(saudeDe(c))) return false
    if (f.prioridades.length && !f.prioridades.includes(c.prioridade)) return false
    if (f.tags.length && !f.tags.some((t) => c.tags.includes(t))) return false
    if (f.status.length && !f.status.includes(c.status)) return false
    if (f.entradaDe && c.dataEntrada.slice(0, 10) < f.entradaDe) return false
    if (f.entradaAte && c.dataEntrada.slice(0, 10) > f.entradaAte) return false
    return true
  })
}

export function filtrosAtivos(f: Filtros): number {
  return (f.busca ? 1 : 0) + f.responsavelIds.length + f.faseIds.length + f.saudes.length + f.prioridades.length + f.tags.length + f.status.length + (f.entradaDe ? 1 : 0) + (f.entradaAte ? 1 : 0)
}
