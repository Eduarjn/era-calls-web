import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Fase, Saude, Usuario } from '@/domain/types'
import { badgePrazo, badgeProximaAcao, ROTULO_SAUDE } from '@/domain/prazo'
import { Avatar, Badge } from '@/ui/Badge'

const COR_PRIORIDADE: Record<Card['prioridade'], string> = {
  baixa: 'var(--muted)', media: 'var(--blue)', alta: 'var(--amber)', critica: 'var(--red)',
}
const COR_SAUDE: Record<Saude, string> = { verde: 'var(--green)', amarelo: 'var(--amber)', vermelho: 'var(--red)' }

/** Dados derivados pela regra de tempo (calculados no Kanban, não no card). */
export interface Derivados {
  saude: Saude
  fora: 'atras' | 'adiante' | null
  aguardando: boolean
}

export interface CardKanbanProps extends HTMLAttributes<HTMLElement> {
  card: Card
  fase: Fase
  responsavel?: Usuario
  derivados?: Derivados
  arrastando?: boolean
  overlay?: boolean
  onAbrir?: (card: Card) => void
  onFinalizar?: (card: Card) => void
}

/** Card compacto: saúde + código + prazo · nome · responsável + próxima ação + prioridade. */
export const CardKanban = forwardRef<HTMLElement, CardKanbanProps>(function CardKanban(
  { card, fase, responsavel, derivados, arrastando, overlay, onAbrir, onFinalizar, style, className = '', ...rest }, ref,
) {
  const prazo = badgePrazo(card)
  const acao = badgeProximaAcao(card)
  const saude = derivados?.saude ?? card.saudeManual ?? card.saude
  const finalizado = card.status === 'finalizado'
  return (
    <article
      ref={ref}
      {...rest}
      style={{ borderLeft: `3px solid ${fase.cor}`, ...style }}
      className={[
        'group relative bg-card border rounded-box p-3 select-none cursor-grab active:cursor-grabbing',
        'transition-[box-shadow,transform,opacity] duration-150',
        derivados?.aguardando ? 'border-accent shadow-[0_0_0_3px_rgba(223,31,45,.12)]' : 'border-line',
        overlay ? 'shadow-lift rotate-[1.5deg] scale-[1.02] cursor-grabbing' : 'shadow-card hover:shadow-lift hover:-translate-y-px',
        arrastando ? 'opacity-30' : '',
        finalizado ? 'opacity-70' : '',
        className,
      ].join(' ')}
      onClick={() => onAbrir?.(card)}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e) // sensores de teclado do dnd-kit (Espaço/setas) continuam funcionando
        if (e.key === 'Enter' && !e.defaultPrevented) onAbrir?.(card)
      }}
      tabIndex={0}
      role="button"
      aria-label={`${card.codigo} ${card.clienteNome}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COR_SAUDE[saude] }} title={`Saúde: ${ROTULO_SAUDE[saude]}`} aria-label={`Saúde ${ROTULO_SAUDE[saude]}`} />
        <span className="font-mono text-[10.5px] text-muted">{card.codigo}</span>
        {card.travadoManualmente && <span className="text-[11px]" title="Fixado: não avança sozinho">📌</span>}
        {card.status === 'pausado' && <Badge cor="neutro">pausado</Badge>}
        <span className="ml-auto" />
        {finalizado
          ? <Badge cor="neutro">{card.resultadoFinal ?? 'finalizado'}</Badge>
          : <Badge cor={prazo.cor} title="Prazo do ciclo">{prazo.rotulo}</Badge>}
      </div>
      <div className="font-semibold text-[14px] text-navy mt-1 leading-snug">{card.clienteNome}</div>

      {(derivados?.fora || derivados?.aguardando) && !finalizado && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {derivados.aguardando && <Badge cor="vermelho" title="Passou do fim da esteira. Registre o desfecho.">⏳ aguardando finalização</Badge>}
          {derivados.fora === 'atras' && <Badge cor="amarelo" title="Está numa fase anterior à esperada pelo tempo">↶ fora da esteira</Badge>}
          {derivados.fora === 'adiante' && <Badge cor="neutro" title="Está numa fase posterior à esperada pelo tempo">↷ fora da esteira</Badge>}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        <Avatar nome={responsavel?.nome ?? '—'} />
        <span className="text-[12px] text-muted truncate">{responsavel?.nome ?? 'Sem responsável'}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {acao && !finalizado && <Badge cor={acao.cor} title={card.proximaAcao?.descricao}>{acao.rotulo}</Badge>}
          <span className="w-2 h-2 rounded-full" style={{ background: COR_PRIORIDADE[card.prioridade] }} title={`Prioridade ${card.prioridade}`} />
        </span>
      </div>

      {derivados?.aguardando && onFinalizar && (
        <button
          className="btn btn-primary btn-sm w-full justify-center mt-2.5"
          onClick={(e) => { e.stopPropagation(); onFinalizar(card) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          Finalizar
        </button>
      )}
    </article>
  )
})

/** Versão ordenável (dentro da coluna). */
export function CardSortable(props: Omit<CardKanbanProps, 'arrastando' | 'overlay'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.card.id, data: { tipo: 'card', card: props.card }, disabled: props.card.status === 'finalizado',
  })
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  return <CardKanban ref={setNodeRef} style={style} arrastando={isDragging} {...attributes} {...listeners} {...props} />
}
