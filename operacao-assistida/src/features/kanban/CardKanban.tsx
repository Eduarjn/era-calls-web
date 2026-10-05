import { usePermissao } from '@/features/board/useBoard'
import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, Fase, Saude, Usuario } from '@/domain/types'
import { badgePrazo, badgeProximaAcao, ROTULO_PRIORIDADE, ROTULO_SAUDE } from '@/domain/prazo'
import { Avatar, Badge, Etiqueta } from '@/ui/Badge'
import { corDoCard, responsavelDigitado } from '@/domain/cardExtras'
import { selosComerciais } from '@/domain/comercial'
import { alertaDo, COR_PRIORIDADE, COR_SAUDE, FUNDO_SAUDE, ICONE_PRIORIDADE, ICONE_SAUDE, ROTULO_ALERTA } from '@/domain/destaque'

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
  const cor = corDoCard(card)
  const alerta = finalizado ? 'normal' : alertaDo(saude, card.prioridade)
  const prioridadeAlta = card.prioridade === 'alta' || card.prioridade === 'critica'
  // Usuário da plataforma ou, na falta dele, o nome digitado no card.
  const nomeResp = responsavel?.nome ?? responsavelDigitado(card)
  const selos = selosComerciais(card)
  return (
    <article
      ref={ref}
      {...rest}
      data-alerta={alerta}
      style={{
        // Barra grossa à esquerda = saúde. A cor escolhida no card vira a faixa do topo.
        borderLeft: `6px solid ${finalizado ? 'var(--line)' : COR_SAUDE[saude]}`,
        ...(cor ? { borderTop: `4px solid ${cor}` } : {}),
        ...(!finalizado && FUNDO_SAUDE[saude] ? { background: FUNDO_SAUDE[saude] } : {}),
        ...style,
      }}
      className={[
        'group relative bg-card border rounded-box p-3 select-none cursor-grab active:cursor-grabbing',
        'transition-[box-shadow,transform,opacity,background-color,border-color] duration-300',
        alerta === 'urgente' && !overlay ? 'oa-urgente' : '',
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
      aria-label={`${card.codigo} ${card.clienteNome} · saúde ${ROTULO_SAUDE[saude]} · prioridade ${ROTULO_PRIORIDADE[card.prioridade]}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10.5px] text-muted">{card.codigo}</span>
        {card.travadoManualmente && <span className="text-[11px]" title="Fixado: não avança sozinho">📌</span>}
        {card.status === 'pausado' && <Badge cor="neutro">pausado</Badge>}
        <span className="ml-auto" />
        {finalizado
          ? <Badge cor="neutro">{card.resultadoFinal ?? 'finalizado'}</Badge>
          : <Badge cor={prazo.cor} title="Prazo do ciclo">{prazo.rotulo}</Badge>}
      </div>
      <div className="font-semibold text-[14px] text-navy mt-1 leading-snug break-words">{card.clienteNome}</div>

      {!finalizado && (saude !== 'verde' || prioridadeAlta) && (
        <div className="flex flex-wrap gap-1 mt-1.5" title={ROTULO_ALERTA[alerta]}>
          {saude !== 'verde' && (
            <Etiqueta cor={COR_SAUDE[saude]} cheia={saude === 'vermelho'} title={card.saudeManual ? 'Saúde definida manualmente' : 'Saúde calculada pelo tempo e pelas ações'}>
              {ICONE_SAUDE[saude]} {ROTULO_SAUDE[saude]}{card.saudeManual ? ' ✋' : ''}
            </Etiqueta>
          )}
          {prioridadeAlta && (
            <Etiqueta cor={COR_PRIORIDADE[card.prioridade]} cheia={card.prioridade === 'critica'} title={`Prioridade ${ROTULO_PRIORIDADE[card.prioridade]}`}>
              {ICONE_PRIORIDADE[card.prioridade]} {ROTULO_PRIORIDADE[card.prioridade]}
            </Etiqueta>
          )}
        </div>
      )}

      {selos.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selos.map((s) => <Etiqueta key={s.chave} cor={s.cor} title={s.title}>{s.rotulo}</Etiqueta>)}
        </div>
      )}

      {(derivados?.fora || derivados?.aguardando) && !finalizado && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {derivados.aguardando && <Badge cor="vermelho" title="Passou do fim da esteira. Registre o desfecho.">⏳ aguardando finalização</Badge>}
          {derivados.fora === 'atras' && <Badge cor="amarelo" title="Está numa fase anterior à esperada pelo tempo">↶ fora da esteira</Badge>}
          {derivados.fora === 'adiante' && <Badge cor="neutro" title="Está numa fase posterior à esperada pelo tempo">↷ fora da esteira</Badge>}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        <Avatar nome={nomeResp ?? '—'} cor={nomeResp ? undefined : 'var(--muted)'} />
        <span className={`text-[12px] truncate ${nomeResp ? 'text-navy font-semibold' : 'text-muted'}`} title={nomeResp ? `Responsável: ${nomeResp}` : undefined}>{nomeResp ?? 'Sem responsável'}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {acao && !finalizado && <Badge cor={acao.cor} title={card.proximaAcao?.descricao}>{acao.rotulo}</Badge>}
          {!prioridadeAlta && !finalizado && (
            <span className="font-mono text-[10px] text-muted" title={`Prioridade ${ROTULO_PRIORIDADE[card.prioridade]}`} aria-label={`Prioridade ${ROTULO_PRIORIDADE[card.prioridade]}`}>{ICONE_PRIORIDADE[card.prioridade]}</span>
          )}
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
  const { somenteLeitura } = usePermissao()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.card.id, data: { tipo: 'card', card: props.card }, disabled: props.card.status === 'finalizado' || somenteLeitura,
  })
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  return <CardKanban ref={setNodeRef} style={style} arrastando={isDragging} {...attributes} {...listeners} {...props} />
}
