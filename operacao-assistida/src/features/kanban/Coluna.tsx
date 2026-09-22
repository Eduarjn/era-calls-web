import { useEffect, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion'
import type { Card, Fase, Usuario } from '@/domain/types'
import { CardSortable, type Derivados } from './CardKanban'
import { QuickAdd } from './QuickAdd'

interface Props {
  fase: Fase
  cards: Card[]
  usuarios: Usuario[]
  derivados: Map<string, Derivados>
  colapsada: boolean
  quickAddAberto: boolean
  criando: boolean
  onAlternarColapso: () => void
  onAbrirQuickAdd: (aberto: boolean) => void
  onCriar: (nome: string) => Promise<unknown>
  onCompletar: (nomeParcial: string) => void
  onAbrirCard: (card: Card) => void
  onFinalizar: (card: Card) => void
}

/** Contador que anima ao mudar (o número "conta" até o novo valor). */
function Contador({ valor }: { valor: number }) {
  const mv = useMotionValue(valor)
  const ref = useRef<HTMLSpanElement>(null)
  const reduzir = useReducedMotion()
  useEffect(() => {
    if (reduzir) { if (ref.current) ref.current.textContent = String(valor); return }
    const c = animate(mv, valor, { duration: .35, ease: 'easeOut', onUpdate: (v) => { if (ref.current) ref.current.textContent = String(Math.round(v)) } })
    return () => c.stop()
  }, [valor, mv, reduzir])
  return <span ref={ref} className="tabular-nums">{valor}</span>
}

export function Coluna({
  fase, cards, usuarios, derivados, colapsada, quickAddAberto, criando,
  onAlternarColapso, onAbrirQuickAdd, onCriar, onCompletar, onAbrirCard, onFinalizar,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: fase.id, data: { tipo: 'coluna', faseId: fase.id } })
  const ativos = cards.filter((c) => c.status !== 'finalizado')
  const estourou = fase.limiteWIP != null && ativos.length > fase.limiteWIP
  const porId = new Map(usuarios.map((u) => [u.id, u]))

  if (colapsada) {
    return (
      <button
        ref={setNodeRef}
        onClick={onAlternarColapso}
        title={`Expandir ${fase.nome}`}
        className={`shrink-0 w-11 rounded-box bg-soft3 border border-line flex flex-col items-center gap-3 py-3 hover:border-accent2 transition-colors ${isOver ? 'border-accent2 bg-accent2/5' : ''}`}
        style={{ boxShadow: `inset 0 3px 0 ${fase.cor}` }}
      >
        <span className="font-mono text-[12px] font-semibold rounded-badge px-1.5 py-0.5" style={{ background: fase.cor + '22', color: fase.cor }}>{cards.length}</span>
        <span className="font-mono text-[10.5px] uppercase tracking-[.08em] text-navy font-semibold [writing-mode:vertical-rl] rotate-180">{fase.nome}</span>
      </button>
    )
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`Fase ${fase.nome}`}
      className={[
        'shrink-0 w-[280px] max-md:w-[86vw] snap-start rounded-box bg-soft3 border flex flex-col max-h-[calc(100vh-250px)] transition-[border-color,background-color,box-shadow] duration-150',
        isOver ? 'border-accent2 bg-accent2/5 shadow-[0_0_0_3px_rgba(68,123,190,.18)]' : 'border-line',
      ].join(' ')}
      style={{ boxShadow: isOver ? undefined : `inset 0 3px 0 ${fase.cor}` }}
    >
      <header className="px-3 pt-3 pb-2.5 flex items-center gap-2 border-b border-line">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: fase.cor }} aria-hidden />
        <span className="font-mono text-[11px] uppercase tracking-[.08em] text-navy font-semibold truncate" title={fase.duracaoDias ? `${fase.duracaoDias} dias nesta fase` : undefined}>{fase.nome}</span>
        <span
          className={`font-mono text-[11.5px] font-semibold rounded-badge px-1.5 py-0.5 ${estourou ? 'bg-red/12 text-red' : ''}`}
          style={estourou ? undefined : { background: fase.cor + '22', color: fase.cor }}
          title={estourou ? `Limite de ${fase.limiteWIP} ultrapassado` : `${cards.length} cliente(s)`}
        >
          <Contador valor={cards.length} />{fase.limiteWIP != null && <span className="opacity-60">/{fase.limiteWIP}</span>}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <button className="w-7 h-7 grid place-items-center rounded-ctl text-muted hover:text-navy hover:bg-card2 text-[16px] leading-none" onClick={() => onAbrirQuickAdd(!quickAddAberto)} title="Novo cliente nesta fase" aria-label={`Novo cliente em ${fase.nome}`}>+</button>
          <button className="w-7 h-7 grid place-items-center rounded-ctl text-muted hover:text-navy hover:bg-card2 text-[13px]" onClick={onAlternarColapso} title="Recolher coluna" aria-label="Recolher coluna">‹</button>
        </span>
      </header>

      <div className="p-2.5 flex flex-col gap-2 overflow-y-auto min-h-[120px]">
        {quickAddAberto && (
          <QuickAdd ocupado={criando} onCriar={onCriar} onFechar={() => onAbrirQuickAdd(false)} onCompletar={onCompletar} />
        )}
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => (
            <motion.div key={c.id} layout="position" transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
              <CardSortable card={c} fase={fase} responsavel={porId.get(c.responsavelId ?? '')} derivados={derivados.get(c.id)} onAbrir={onAbrirCard} onFinalizar={onFinalizar} />
            </motion.div>
          ))}
        </SortableContext>
        {cards.length === 0 && !quickAddAberto && (
          <button onClick={() => onAbrirQuickAdd(true)} className="text-[12.5px] text-muted text-center py-6 rounded-ctl border border-dashed border-line hover:border-accent2 hover:text-navy transition-colors">
            Nenhum cliente aqui. <span className="underline">Adicionar</span>
          </button>
        )}
      </div>
    </section>
  )
}
