import { useEffect, useRef, useState } from 'react'

interface Props {
  placeholder?: string
  ocupado?: boolean
  onCriar: (nome: string) => Promise<unknown> | void
  onFechar: () => void
  onCompletar?: (nomeParcial: string) => void
}

/**
 * Input inline: Enter cria e mantém aberto para o próximo; Esc fecha.
 * "Completar cadastro" abre o formulário completo sem perder o que foi digitado.
 */
export function QuickAdd({ placeholder = 'Nome do cliente', ocupado, onCriar, onFechar, onCompletar }: Props) {
  const [nome, setNome] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  async function criar() {
    const n = nome.trim()
    if (!n) return
    setNome('')
    await onCriar(n)
    ref.current?.focus()
  }

  return (
    <div className="bg-card border border-accent2 rounded-box p-2 shadow-card">
      <input
        ref={ref}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder={placeholder}
        aria-label="Nome do cliente"
        className="!py-2 !text-[14px]"
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); criar() }
          if (e.key === 'Escape') { e.preventDefault(); onFechar() }
        }}
      />
      <div className="flex items-center gap-1.5 mt-2">
        <button className="btn btn-primary btn-sm" onClick={criar} disabled={ocupado || !nome.trim()}>Criar</button>
        {onCompletar && <button className="btn btn-soft btn-sm" onClick={() => onCompletar(nome)}>Completar cadastro</button>}
        <span className="flex-1" />
        <button className="btn btn-soft btn-sm" onClick={onFechar} aria-label="Fechar">Esc</button>
      </div>
      <div className="text-[11px] text-muted mt-1.5">Enter cria e já deixa pronto para o próximo.</div>
    </div>
  )
}
