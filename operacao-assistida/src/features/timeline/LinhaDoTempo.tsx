import { useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Board, Card, Usuario } from '@/domain/types'
import { diasEntre, hojeISO, noFuso, somarDiasISO } from '@/domain/datas'
import { fasesDaEsteira } from '@/domain/esteira'
import { useUI } from '@/store/uiStore'
import type { Derivados } from '@/features/kanban/CardKanban'
import { Avatar } from '@/ui/Badge'

interface Props { board: Board; cards: Card[]; usuarios: Usuario[]; derivados: Map<string, Derivados> }

const PX_DIA = 22

/** Gantt leve: uma faixa por cliente, marcos das fases, linha de hoje, atraso em vermelho. */
export function LinhaDoTempo({ board, cards, usuarios, derivados }: Props) {
  const fuso = board.configuracoes.fusoHorario
  const abrirCard = useUI((s) => s.abrirCard)
  const hoje = hojeISO(fuso)
  const esteira = fasesDaEsteira(board.fases)

  const { inicio, totalDias, linhas } = useMemo(() => {
    const ativos = [...cards].filter((c) => c.status !== 'cancelado').sort((a, b) => a.dataEntrada.localeCompare(b.dataEntrada))
    if (!ativos.length) return { inicio: hoje, totalDias: 30, linhas: [] as Card[] }
    const min = ativos.reduce((m, c) => (c.dataEntrada < m ? c.dataEntrada : m), ativos[0]!.dataEntrada)
    const max = ativos.reduce((m, c) => { const fim = c.dataSaidaReal ?? c.dataPrevistaSaida; const f = fim > hoje ? fim : hoje; return f > m ? f : m }, hoje)
    const inicio = somarDiasISO(min, -2, fuso)
    return { inicio, totalDias: diasEntre(inicio, max, fuso) + 4, linhas: ativos }
  }, [cards, hoje, fuso])

  const x = (iso: string) => diasEntre(inicio, iso, fuso) * PX_DIA
  const largura = totalDias * PX_DIA
  const semanas = Array.from({ length: Math.ceil(totalDias / 7) }, (_, i) => somarDiasISO(inicio, i * 7, fuso))

  if (!linhas.length) return <div className="text-[13px] text-muted border border-dashed border-line rounded-box p-8 text-center">Nenhum cliente para mostrar.</div>

  return (
    <div className="bg-card border border-line rounded-box shadow-card overflow-hidden">
      <div className="flex">
        {/* Coluna fixa de nomes */}
        <div className="w-[220px] shrink-0 border-r border-line z-[1] bg-card">
          <div className="h-9 border-b border-line lbl flex items-center px-3">Cliente</div>
          {linhas.map((c) => (
            <button key={c.id} onClick={() => abrirCard(c.id)} className="h-11 w-full flex items-center gap-2 px-3 border-b border-line last:border-b-0 text-left hover:bg-soft3">
              <Avatar nome={usuarios.find((u) => u.id === c.responsavelId)?.nome ?? '—'} tamanho={20} />
              <span className="min-w-0"><span className="block font-semibold text-[13px] text-navy truncate">{c.clienteNome}</span><span className="block font-mono text-[10.5px] text-muted">{c.codigo}</span></span>
            </button>
          ))}
        </div>
        {/* Área rolável */}
        <div className="overflow-x-auto flex-1">
          <div style={{ width: largura }} className="relative">
            <div className="h-9 border-b border-line relative">
              {semanas.map((s, i) => (
                <div key={i} className="absolute top-0 h-full border-l border-line px-1.5 font-mono text-[10.5px] text-muted flex items-center" style={{ left: i * 7 * PX_DIA, width: 7 * PX_DIA }}>{format(noFuso(s, fuso), 'd MMM', { locale: ptBR })}</div>
              ))}
            </div>
            {/* linha de hoje */}
            <div className="absolute top-0 bottom-0 w-px bg-accent z-[2]" style={{ left: x(hoje) + PX_DIA / 2 }} title="Hoje"><span className="absolute -top-0 left-1 font-mono text-[9.5px] text-accent font-semibold">hoje</span></div>
            {linhas.map((c) => {
              const d = derivados.get(c.id)
              const fim = c.dataSaidaReal ?? c.dataPrevistaSaida
              const fimBarra = c.status === 'finalizado' ? fim : (fim > hoje ? fim : hoje)
              const atraso = c.status !== 'finalizado' && hoje > c.dataPrevistaSaida
              const faseAtual = board.fases.find((f) => f.id === c.faseId)
              let acumulado = 0
              const marcos = esteira.slice(0, -1).map((f, i) => { acumulado += Math.max(0, f.duracaoDias); return { iso: somarDiasISO(c.dataEntrada, acumulado, fuso), fase: esteira[i + 1]! } })
              return (
                <div key={c.id} className="h-11 border-b border-line last:border-b-0 relative">
                  {semanas.map((_, i) => <div key={i} className="absolute top-0 h-full border-l border-line/60" style={{ left: i * 7 * PX_DIA }} />)}
                  <button
                    onClick={() => abrirCard(c.id)}
                    className="absolute top-2.5 h-6 rounded-ctl text-[11px] font-medium text-white px-2 truncate text-left hover:brightness-110 transition"
                    style={{ left: x(c.dataEntrada), width: Math.max(PX_DIA, (diasEntre(c.dataEntrada, c.dataPrevistaSaida, fuso) + 1) * PX_DIA), background: c.status === 'finalizado' ? '#6B5BD2' : (faseAtual?.cor ?? 'var(--accent2)'), opacity: c.status === 'finalizado' ? .7 : 1 }}
                    title={`${c.clienteNome}: ${format(noFuso(c.dataEntrada, fuso), 'dd/MM')} → ${format(noFuso(c.dataPrevistaSaida, fuso), 'dd/MM')}`}
                  >
                    {faseAtual?.nome}{d?.fora ? ` ${d.fora === 'atras' ? '↶' : '↷'}` : ''}
                  </button>
                  {atraso && (
                    <div className="absolute top-2.5 h-6 rounded-r-ctl bg-red/80 text-white text-[10.5px] font-mono flex items-center px-1.5" style={{ left: x(c.dataPrevistaSaida) + PX_DIA, width: Math.max(PX_DIA, diasEntre(c.dataPrevistaSaida, fimBarra, fuso) * PX_DIA) }} title="Atraso">
                      +{diasEntre(c.dataPrevistaSaida, hoje, fuso)} d
                    </div>
                  )}
                  {marcos.map((m, i) => <span key={i} className="absolute top-1.5 w-[2px] h-8 rounded" style={{ left: x(m.iso), background: m.fase.cor, opacity: .9 }} title={`${m.fase.nome} a partir de ${format(noFuso(m.iso, fuso), 'dd/MM')}`} />)}
                  {c.proximaAcao && c.status !== 'finalizado' && <span className="absolute top-0 text-[11px]" style={{ left: x(c.proximaAcao.dataPrazo) + 4 }} title={`Próxima ação: ${c.proximaAcao.descricao}`}>▾</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
