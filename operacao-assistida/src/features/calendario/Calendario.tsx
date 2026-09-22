import { useMemo, useState } from 'react'
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Board, Card } from '@/domain/types'
import { agora, hojeISO } from '@/domain/datas'
import { COR_EVENTO_CAL, ROTULO_EVENTO_CAL, contarPorDia, eventosDoCalendario, type EventoCalendario, type TipoEventoCalendario } from '@/domain/calendario'
import { useUI } from '@/store/uiStore'

interface Props { board: Board; cards: Card[] }
type Modo = 'mes' | 'semana' | 'agenda'

const TIPOS: TipoEventoCalendario[] = ['entrada', 'saida', 'saida_prevista', 'acao', 'fase']

/** Calendário: mês (principal), semana e agenda. Chips coloridos por tipo; contadores de entradas/saídas. */
export function Calendario({ board, cards }: Props) {
  const fuso = board.configuracoes.fusoHorario
  const abrirCard = useUI((s) => s.abrirCard)
  const [modo, setModo] = useState<Modo>('mes')
  const [ref, setRef] = useState<Date>(() => agora(fuso))
  const [tiposAtivos, setTiposAtivos] = useState<TipoEventoCalendario[]>(['entrada', 'saida', 'saida_prevista', 'acao'])
  const hoje = hojeISO(fuso).slice(0, 10)

  const eventos = useMemo(() => eventosDoCalendario(cards, board.fases, fuso).filter((e) => tiposAtivos.includes(e.tipo)), [cards, board.fases, fuso, tiposAtivos])
  const porDia = useMemo(() => { const m = new Map<string, EventoCalendario[]>(); for (const e of eventos) m.set(e.dia, [...(m.get(e.dia) ?? []), e]); return m }, [eventos])
  const contadores = useMemo(() => contarPorDia(eventosDoCalendario(cards, board.fases, fuso)), [cards, board.fases, fuso])

  const intervalo = modo === 'semana'
    ? { inicio: startOfWeek(ref, { weekStartsOn: 1 }), fim: endOfWeek(ref, { weekStartsOn: 1 }) }
    : modo === 'agenda'
      ? { inicio: ref, fim: addDays(ref, 30) }
      : { inicio: startOfWeek(startOfMonth(ref), { weekStartsOn: 1 }), fim: endOfWeek(endOfMonth(ref), { weekStartsOn: 1 }) }
  const dias = eachDayOfInterval({ start: intervalo.inicio, end: intervalo.fim })

  const totalPeriodo = dias.reduce((acc, d) => { const c = contadores.get(format(d, 'yyyy-MM-dd')); if (c && (modo !== 'mes' || isSameMonth(d, ref))) { acc.entradas += c.entradas; acc.saidas += c.saidas } return acc }, { entradas: 0, saidas: 0 })

  function navegar(delta: number) {
    setRef((r) => modo === 'mes' ? addMonths(r, delta) : modo === 'semana' ? addWeeks(r, delta) : addDays(r, delta * 30))
  }

  const titulo = modo === 'mes' ? format(ref, 'MMMM yyyy', { locale: ptBR }) : modo === 'semana'
    ? `${format(intervalo.inicio, 'd MMM', { locale: ptBR })} – ${format(intervalo.fim, 'd MMM yyyy', { locale: ptBR })}`
    : `${format(ref, 'd MMM', { locale: ptBR })} → ${format(intervalo.fim, 'd MMM yyyy', { locale: ptBR })}`

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button className="btn btn-soft btn-sm" onClick={() => navegar(-1)} aria-label="Anterior">‹</button>
        <button className="btn btn-soft btn-sm" onClick={() => setRef(agora(fuso))}>Hoje</button>
        <button className="btn btn-soft btn-sm" onClick={() => navegar(1)} aria-label="Próximo">›</button>
        <h3 className="text-[17px] capitalize ml-1">{titulo}</h3>
        <span className="flex-1" />
        <span className="flex items-center gap-2 font-mono text-[12px] mr-2">
          <span className="text-blue">+{totalPeriodo.entradas} entraram</span>
          <span className="text-muted">·</span>
          <span style={{ color: COR_EVENTO_CAL.saida }}>−{totalPeriodo.saidas} saíram/saem</span>
          <span className="text-muted">·</span>
          <span className="text-navy font-semibold">saldo {totalPeriodo.entradas - totalPeriodo.saidas >= 0 ? '+' : ''}{totalPeriodo.entradas - totalPeriodo.saidas}</span>
        </span>
        <div className="inline-flex border border-line rounded-ctl overflow-hidden bg-card" role="tablist">
          {(['mes', 'semana', 'agenda'] as Modo[]).map((m) => (
            <button key={m} role="tab" aria-selected={modo === m} onClick={() => setModo(m)} className={`px-2.5 py-1 text-[12.5px] font-semibold border-r border-line last:border-r-0 ${modo === m ? 'bg-navy text-bg2' : 'text-muted hover:text-navy'}`}>{m === 'mes' ? 'Mês' : m === 'semana' ? 'Semana' : 'Agenda'}</button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        {TIPOS.map((t) => {
          const on = tiposAtivos.includes(t)
          return <button key={t} onClick={() => setTiposAtivos((a) => on ? a.filter((x) => x !== t) : [...a, t])} className={`inline-flex items-center gap-1.5 rounded-badge border px-2 py-1 font-mono text-[11px] transition-colors ${on ? 'border-transparent text-white' : 'border-line text-muted'}`} style={on ? { background: COR_EVENTO_CAL[t] } : undefined} aria-pressed={on}><span className="w-2 h-2 rounded-full" style={{ background: on ? 'rgba(255,255,255,.8)' : COR_EVENTO_CAL[t] }} />{ROTULO_EVENTO_CAL[t]}</button>
        })}
      </div>

      {modo === 'agenda' ? (
        <Agenda dias={dias} porDia={porDia} hoje={hoje} onAbrir={abrirCard} />
      ) : (
        <div className="bg-card border border-line rounded-box shadow-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">
            {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <div key={d} className="lbl text-center py-2">{d}</div>)}
          </div>
          <div className={`grid grid-cols-7 ${modo === 'semana' ? 'auto-rows-[minmax(220px,auto)]' : 'auto-rows-[minmax(112px,auto)]'}`}>
            {dias.map((d) => {
              const k = format(d, 'yyyy-MM-dd'); const lista = porDia.get(k) ?? []; const c = contadores.get(k)
              const fora = modo === 'mes' && !isSameMonth(d, ref); const ehHoje = k === hoje
              return (
                <div key={k} className={`border-r border-b border-line last:border-r-0 p-1.5 flex flex-col gap-1 min-w-0 ${fora ? 'bg-soft3 opacity-60' : ''} ${ehHoje ? 'bg-accent/5' : ''}`}>
                  <div className="flex items-center gap-1">
                    <span className={`font-mono text-[12px] w-6 h-6 grid place-items-center rounded-full ${ehHoje ? 'bg-accent text-white font-semibold' : 'text-navy'}`}>{format(d, 'd')}</span>
                    {c && (c.entradas > 0 || c.saidas > 0) && <span className="ml-auto font-mono text-[10px] text-muted">{c.entradas > 0 && <span className="text-blue">+{c.entradas}</span>}{c.entradas > 0 && c.saidas > 0 && ' '}{c.saidas > 0 && <span style={{ color: COR_EVENTO_CAL.saida }}>−{c.saidas}</span>}</span>}
                  </div>
                  {lista.slice(0, modo === 'semana' ? 12 : 3).map((e, i) => <Chip key={i} e={e} onAbrir={abrirCard} />)}
                  {lista.length > (modo === 'semana' ? 12 : 3) && <span className="text-[10.5px] text-muted font-mono">+{lista.length - (modo === 'semana' ? 12 : 3)}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ e, onAbrir }: { e: EventoCalendario; onAbrir: (id: string) => void }) {
  return (
    <button
      onClick={() => onAbrir(e.cardId)}
      className="w-full text-left truncate rounded-badge px-1.5 py-[3px] text-[11px] font-medium text-white hover:brightness-110 transition"
      style={{ background: e.cor }}
      title={`${ROTULO_EVENTO_CAL[e.tipo]}: ${e.titulo}`}
    >
      {e.titulo}
    </button>
  )
}

function Agenda({ dias, porDia, hoje, onAbrir }: { dias: Date[]; porDia: Map<string, EventoCalendario[]>; hoje: string; onAbrir: (id: string) => void }) {
  const comEventos = dias.map((d) => ({ d, k: format(d, 'yyyy-MM-dd') })).filter(({ k }) => (porDia.get(k) ?? []).length > 0)
  if (!comEventos.length) return <div className="text-[13px] text-muted border border-dashed border-line rounded-box p-8 text-center">Nada agendado nos próximos 30 dias.</div>
  return (
    <div className="flex flex-col gap-2">
      {comEventos.map(({ d, k }) => (
        <div key={k} className={`bg-card border border-line rounded-box p-3 flex gap-4 ${k === hoje ? 'border-accent' : ''}`}>
          <div className="w-[70px] shrink-0"><div className="font-mono text-[20px] font-semibold text-navy leading-none">{format(d, 'd')}</div><div className="lbl mt-1">{format(d, 'EEE', { locale: ptBR })}</div></div>
          <div className="flex-1 flex flex-col gap-1.5">
            {porDia.get(k)!.map((e, i) => (
              <button key={i} onClick={() => onAbrir(e.cardId)} className="flex items-center gap-2 text-left text-[13px] hover:text-accent2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.cor }} /><span className="font-mono text-[10.5px] text-muted w-[100px] shrink-0">{ROTULO_EVENTO_CAL[e.tipo]}</span><span className="truncate">{e.titulo}</span></button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
