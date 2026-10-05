import { usePermissao } from '@/features/board/useBoard'
import { useEffect, useMemo, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Board, Card, Usuario } from '@/domain/types'
import { useUI } from '@/store/uiStore'
import { useCriarCard, useMoverCard } from '@/features/board/mutations'
import { Coluna } from './Coluna'
import { CardKanban, type Derivados } from './CardKanban'
import { alertaDo, type Alerta } from '@/domain/destaque'

const PESO_ALERTA: Record<Alerta, number> = { urgente: 0, risco: 1, atencao: 2, normal: 3 }

interface Props {
  board: Board
  cards: Card[]
  usuarios: Usuario[]
  /** Saúde / fora da esteira / aguardando finalização, por card. */
  derivados: Map<string, Derivados>
}

export function Kanban({ board, cards, usuarios, derivados }: Props) {
  const fases = useMemo(() => board.fases.filter((f) => !f.arquivada).sort((a, b) => a.ordem - b.ordem), [board.fases])
  const mostrarFinalizados = useUI((s) => s.mostrarFinalizados)
  const urgentesPrimeiro = useUI((s) => s.urgentesPrimeiro)
  const visiveis = useMemo(() => {
    const lista = cards.filter((c) => c.status === 'ativo' || c.status === 'pausado' || (mostrarFinalizados && c.status === 'finalizado'))
    if (!urgentesPrimeiro) return lista
    // Ordenação estável: dentro do mesmo nível de alerta mantém a ordem original.
    const peso = (c: Card) => c.status === 'finalizado' ? 9 : PESO_ALERTA[alertaDo(derivados.get(c.id)?.saude ?? c.saudeManual ?? c.saude, c.prioridade)]
    return lista.map((c, i) => ({ c, i })).sort((a, b) => peso(a.c) - peso(b.c) || a.i - b.i).map((x) => x.c)
  }, [cards, mostrarFinalizados, urgentesPrimeiro, derivados])

  const colapsadas = useUI((s) => s.colunasColapsadas)
  const alternarColuna = useUI((s) => s.alternarColuna)
  const quickAddFaseId = useUI((s) => s.quickAddFaseId)
  const abrirQuickAdd = useUI((s) => s.abrirQuickAdd)
  const abrirCard = useUI((s) => s.abrirCard)
  const abrirDesfecho = useUI((s) => s.abrirDesfecho)

  const mover = useMoverCard(board.id, fases)
  const criar = useCriarCard(board.id)
  const [arrastando, setArrastando] = useState<Card | null>(null)

  const { somenteLeitura } = usePermissao()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Atalho global: N abre o quick add na primeira fase; Esc fecha.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null
      const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)
      if (e.key === 'Escape') { abrirQuickAdd(null); return }
      if (digitando || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'n' && fases[0] && !somenteLeitura) { e.preventDefault(); abrirQuickAdd(fases[0].id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fases, abrirQuickAdd, somenteLeitura])

  function onDragStart(e: DragStartEvent) {
    setArrastando((e.active.data.current?.card as Card) ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    const card = arrastando
    setArrastando(null)
    if (!card || !e.over || somenteLeitura) return
    const dados = e.over.data.current
    const paraFaseId: string | undefined =
      dados?.tipo === 'coluna' ? (dados.faseId as string) : (dados?.card as Card | undefined)?.faseId
    if (!paraFaseId || paraFaseId === card.faseId) return
    mover.mutate({ card, paraFaseId })
  }

  const faseDoArrastando = arrastando ? fases.find((f) => f.id === arrastando.faseId) : undefined

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setArrastando(null)}>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 max-[560px]:snap-x max-[560px]:snap-mandatory items-start" role="list" aria-label="Quadro de operação assistida">
        {fases.map((f) => (
          <Coluna
            key={f.id}
            fase={f}
            cards={visiveis.filter((c) => c.faseId === f.id)}
            usuarios={usuarios}
            derivados={derivados}
            colapsada={!!colapsadas[f.id]}
            quickAddAberto={quickAddFaseId === f.id}
            criando={criar.isPending}
            onAlternarColapso={() => alternarColuna(f.id)}
            onAbrirQuickAdd={(aberto) => abrirQuickAdd(aberto ? f.id : null)}
            onCriar={(nome) => criar.mutateAsync({ boardId: board.id, faseId: f.id, clienteNome: nome })}
            onCompletar={async (nomeParcial) => {
              const novo = await criar.mutateAsync({ boardId: board.id, faseId: f.id, clienteNome: nomeParcial.trim() || 'Novo cliente' })
              abrirQuickAdd(null)
              abrirCard(novo.id)
            }}
            onAbrirCard={(c) => abrirCard(c.id)}
            onFinalizar={(c) => abrirDesfecho(c.id)}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
        {arrastando && faseDoArrastando && (
          <CardKanban card={arrastando} fase={faseDoArrastando} responsavel={usuarios.find((u) => u.id === arrastando.responsavelId)} derivados={derivados.get(arrastando.id)} overlay />
        )}
      </DragOverlay>
    </DndContext>
  )
}
