import type { Prioridade, Saude } from './types'

/**
 * Como saúde e prioridade aparecem nos cards (kanban, lista, painel).
 * Regra de leitura rápida:
 *  - barra grossa à esquerda = SAÚDE (verde / âmbar / vermelho), sempre;
 *  - fundo tingido = saúde fora do verde;
 *  - etiqueta "▲ Alta" / "▲▲ Crítica" = PRIORIDADE (baixa e média não gritam);
 *  - contorno pulsando = combinação que pede ação já (em risco + alta/crítica, ou crítica).
 */
export const COR_SAUDE: Record<Saude, string> = { verde: 'var(--green)', amarelo: 'var(--amber)', vermelho: 'var(--red)' }
export const ICONE_SAUDE: Record<Saude, string> = { verde: '●', amarelo: '⚠', vermelho: '⬤' }

export const COR_PRIORIDADE: Record<Prioridade, string> = {
  baixa: 'var(--muted)', media: 'var(--blue)', alta: 'var(--amber)', critica: 'var(--red)',
}
export const ICONE_PRIORIDADE: Record<Prioridade, string> = { baixa: '▽', media: '◇', alta: '▲', critica: '▲▲' }

/** Nível de alerta do card: decide fundo, contorno e ordem de atenção. */
export type Alerta = 'normal' | 'atencao' | 'risco' | 'urgente'

export function alertaDo(saude: Saude, prioridade: Prioridade): Alerta {
  const altaOuMais = prioridade === 'alta' || prioridade === 'critica'
  if ((saude === 'vermelho' && altaOuMais) || (prioridade === 'critica' && saude !== 'verde')) return 'urgente'
  if (saude === 'vermelho' || prioridade === 'critica') return 'risco'
  if (saude === 'amarelo' || prioridade === 'alta') return 'atencao'
  return 'normal'
}

/** Fundo tingido do card pela saúde (a cor escolhida pelo usuário vai para a faixa do topo). */
export const FUNDO_SAUDE: Record<Saude, string | undefined> = {
  verde: undefined,
  amarelo: 'color-mix(in srgb, var(--amber) 9%, var(--card))',
  vermelho: 'color-mix(in srgb, var(--red) 10%, var(--card))',
}

export const ROTULO_ALERTA: Record<Alerta, string> = {
  normal: 'Sem alerta', atencao: 'Atenção', risco: 'Em risco', urgente: 'Urgente: risco com prioridade alta',
}
