import { useEffect, useRef, useState } from 'react'

interface Opcao { valor: string; rotulo: string; cor?: string }

interface Props {
  rotulo: string
  opcoes: Opcao[]
  valores: string[]
  onChange: (valores: string[]) => void
}

/** Botão que abre uma lista de checkboxes. Fecha com Esc ou clique fora. */
export function MultiSelect({ rotulo, opcoes, valores, onChange }: Props) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora); window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('keydown', esc) }
  }, [aberto])

  const ativo = valores.length > 0
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`btn btn-sm ${ativo ? 'btn-ghost !border-accent2 !text-accent2' : 'btn-soft'}`}
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="listbox" aria-expanded={aberto}
      >
        {rotulo}{ativo && <span className="font-mono text-[11px] rounded-badge bg-accent2 text-white px-1">{valores.length}</span>}
        <span className="opacity-60 text-[10px]">▾</span>
      </button>
      {aberto && (
        <div className="absolute z-20 mt-1 min-w-[200px] max-h-[280px] overflow-y-auto bg-modal border border-line rounded-box shadow-lift p-1.5" role="listbox" aria-multiselectable="true">
          {opcoes.length === 0 && <div className="text-[12px] text-muted px-2 py-1.5">Nada para filtrar.</div>}
          {opcoes.map((o) => {
            const marcado = valores.includes(o.valor)
            return (
              <label key={o.valor} className="flex items-center gap-2 px-2 py-1.5 rounded-ctl hover:bg-card2 cursor-pointer text-[13px]" role="option" aria-selected={marcado}>
                <input type="checkbox" className="!w-auto" checked={marcado} onChange={(e) => onChange(e.target.checked ? [...valores, o.valor] : valores.filter((v) => v !== o.valor))} />
                {o.cor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.cor }} />}
                <span className="truncate">{o.rotulo}</span>
              </label>
            )
          })}
          {ativo && <button type="button" className="w-full text-left text-[12px] text-muted hover:text-navy px-2 py-1.5 mt-1 border-t border-line" onClick={() => onChange([])}>Limpar</button>}
        </div>
      )}
    </div>
  )
}
