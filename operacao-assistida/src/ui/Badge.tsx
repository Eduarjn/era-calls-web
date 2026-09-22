import type { ReactNode } from 'react'
import type { CorPrazo } from '@/domain/prazo'

const CORES: Record<CorPrazo, string> = {
  verde: 'bg-green/12 text-green',
  amarelo: 'bg-amber/14 text-amber',
  vermelho: 'bg-red/12 text-red',
  neutro: 'bg-soft2 text-muted',
}

/** Badge 3px (nada de pill), texto mono pequeno. */
export function Badge({ cor = 'neutro', children, title, className = '' }: { cor?: CorPrazo; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-badge px-1.5 py-[3px] font-mono text-[10.5px] font-semibold leading-none whitespace-nowrap ${CORES[cor]} ${className}`}>
      {children}
    </span>
  )
}

export function Avatar({ nome, cor, tamanho = 22 }: { nome: string; cor?: string; tamanho?: number }) {
  const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?'
  return (
    <span
      className="inline-grid place-items-center rounded-full font-mono font-semibold text-white shrink-0"
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * .42, background: cor ?? 'var(--accent2)' }}
      title={nome}
      aria-label={nome}
    >
      {ini}
    </span>
  )
}
