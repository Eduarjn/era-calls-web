import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import type { Board, Card, Usuario } from '@/domain/types'
import { getRepository } from '@/data'
import { agora, diasEntre, hojeISO } from '@/domain/datas'
import { INFO_TIPO } from '@/features/historico/tipos'
import type { Derivados } from '@/features/kanban/CardKanban'
import { Avatar } from '@/ui/Badge'

interface Props { board: Board; cards: Card[]; usuarios: Usuario[]; derivados: Map<string, Derivados> }

/** Painel: cartões de métrica e gráficos simples de barras (SVG inline, sem biblioteca). */
export function Painel({ board, cards, usuarios, derivados }: Props) {
  const fuso = board.configuracoes.fusoHorario
  const hoje = hojeISO(fuso)
  const [periodoDias, setPeriodoDias] = useState(30)
  const fases = board.fases.filter((f) => !f.arquivada).sort((a, b) => a.ordem - b.ordem)

  const eventos = useQuery({ queryKey: ['eventos-board', board.id], queryFn: () => getRepository().listarEventosDoBoard(board.id) })

  const m = useMemo(() => {
    const ativos = cards.filter((c) => c.status === 'ativo' || c.status === 'pausado')
    const finalizados = cards.filter((c) => c.status === 'finalizado')
    const mesAtual = format(agora(fuso), 'yyyy-MM')
    const entradasMes = cards.filter((c) => c.dataEntrada.slice(0, 7) === mesAtual).length
    const saidasMes = finalizados.filter((c) => (c.dataSaidaReal ?? '').slice(0, 7) === mesAtual).length
    const ciclos = finalizados.filter((c) => c.dataSaidaReal).map((c) => diasEntre(c.dataEntrada, c.dataSaidaReal!, fuso))
    const tempoMedio = ciclos.length ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null
    const noPrazo = finalizados.filter((c) => c.dataSaidaReal && c.dataSaidaReal.slice(0, 10) <= c.dataPrevistaSaida.slice(0, 10)).length
    const taxaPrazo = finalizados.length ? Math.round((noPrazo / finalizados.length) * 100) : null
    const emRisco = ativos.filter((c) => derivados.get(c.id)?.saude === 'vermelho')
    const porFase = fases.map((f) => ({ f, n: ativos.filter((c) => c.faseId === f.id).length }))
    const corte = subDays(agora(fuso), periodoDias).toISOString()
    const acionamentos = (eventos.data ?? []).filter((e) => !e.geradoPeloSistema && e.dataHora >= corte)
    const porTipo = Object.entries(acionamentos.reduce<Record<string, number>>((acc, e) => { acc[e.tipo] = (acc[e.tipo] ?? 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1])
    const ranking = usuarios.map((u) => ({
      u, ativos: ativos.filter((c) => c.responsavelId === u.id).length,
      acionamentos: acionamentos.filter((e) => e.autorId === u.id).length,
      finalizados: finalizados.filter((c) => c.responsavelId === u.id).length,
      risco: emRisco.filter((c) => c.responsavelId === u.id).length,
    })).sort((a, b) => b.acionamentos - a.acionamentos || b.ativos - a.ativos)
    const resultados = (['estabilizado', 'prorrogado', 'escalado', 'churn'] as const).map((r) => ({ r, n: finalizados.filter((c) => c.resultadoFinal === r).length }))
    return { ativos, finalizados, entradasMes, saidasMes, tempoMedio, taxaPrazo, emRisco, porFase, acionamentos, porTipo, ranking, resultados }
  }, [cards, derivados, fases, usuarios, eventos.data, fuso, periodoDias])

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Metrica n={m.ativos.length} l="clientes ativos" />
        <Metrica n={`+${m.entradasMes} / −${m.saidasMes}`} l="entradas / saídas no mês" />
        <Metrica n={m.tempoMedio != null ? `${m.tempoMedio} d` : '—'} l="tempo médio de ciclo" s={m.finalizados.length ? `${m.finalizados.length} finalizado(s)` : 'sem finalizados ainda'} />
        <Metrica n={m.taxaPrazo != null ? `${m.taxaPrazo}%` : '—'} l="finalizados no prazo" cor={m.taxaPrazo != null && m.taxaPrazo < 70 ? 'var(--amber)' : undefined} />
        <Metrica n={m.emRisco.length} l="em risco" cor={m.emRisco.length ? 'var(--red)' : 'var(--green)'} />
        <Metrica n={m.acionamentos.length} l={`acionamentos · ${periodoDias} d`} s={eventos.isLoading ? 'carregando…' : undefined} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Bloco titulo="Clientes ativos por fase">
          <Barras itens={m.porFase.map((x) => ({ rotulo: x.f.nome, valor: x.n, cor: x.f.cor }))} />
        </Bloco>
        <Bloco titulo={`Acionamentos por tipo`} acao={
          <select className="!w-auto !py-1 !text-[12px]" value={periodoDias} onChange={(e) => setPeriodoDias(Number(e.target.value))} aria-label="Período">
            {[7, 14, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}
          </select>}>
          {m.porTipo.length ? <Barras itens={m.porTipo.map(([t, n]) => ({ rotulo: `${INFO_TIPO[t as keyof typeof INFO_TIPO]?.icone ?? ''} ${INFO_TIPO[t as keyof typeof INFO_TIPO]?.rotulo ?? t}`, valor: n, cor: INFO_TIPO[t as keyof typeof INFO_TIPO]?.cor ?? 'var(--muted)' }))} /> : <Vazio>Nenhum acionamento no período.</Vazio>}
        </Bloco>
        <Bloco titulo="Ranking por responsável">
          <table className="w-full text-[13px]">
            <thead><tr className="lbl text-left"><th className="py-1 font-normal">Pessoa</th><th className="py-1 font-normal text-right">Ativos</th><th className="py-1 font-normal text-right">Acion.</th><th className="py-1 font-normal text-right">Finaliz.</th><th className="py-1 font-normal text-right">Risco</th></tr></thead>
            <tbody>
              {m.ranking.map((r, i) => (
                <tr key={r.u.id} className="border-t border-line">
                  <td className="py-1.5 flex items-center gap-2"><span className="font-mono text-[11px] text-muted w-4">{i + 1}</span><Avatar nome={r.u.nome} tamanho={20} />{r.u.nome}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{r.ativos}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{r.acionamentos}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums">{r.finalizados}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums" style={{ color: r.risco ? 'var(--red)' : undefined }}>{r.risco}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloco>
        <Bloco titulo="Clientes em risco">
          {m.emRisco.length ? (
            <ul className="flex flex-col gap-1.5">
              {m.emRisco.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[13px]"><span className="w-2 h-2 rounded-full bg-red" /><span className="font-semibold text-navy">{c.clienteNome}</span><span className="text-muted font-mono text-[11px]">{fases.find((f) => f.id === c.faseId)?.nome} · {usuarios.find((u) => u.id === c.responsavelId)?.nome ?? '—'}</span>{derivados.get(c.id)?.aguardando && <span className="ml-auto font-mono text-[10.5px] text-accent">⏳ finalizar</span>}{c.dataPrevistaSaida < hoje && !derivados.get(c.id)?.aguardando && <span className="ml-auto font-mono text-[10.5px] text-red">vencido</span>}</li>
              ))}
            </ul>
          ) : <Vazio>Nenhum cliente em risco. 🎉</Vazio>}
        </Bloco>
        <Bloco titulo="Resultados das finalizações">
          {m.finalizados.length ? <Barras itens={m.resultados.map((x) => ({ rotulo: x.r, valor: x.n, cor: ({ estabilizado: 'var(--green)', prorrogado: 'var(--amber)', escalado: 'var(--blue)', churn: 'var(--red)' })[x.r] }))} /> : <Vazio>Ainda não há finalizações.</Vazio>}
        </Bloco>
      </div>
    </div>
  )
}

function Metrica({ n, l, s, cor }: { n: number | string; l: string; s?: string; cor?: string }) {
  return (
    <div className="bg-card border border-line rounded-box px-4 py-3 shadow-card">
      <div className="font-mono text-[26px] font-semibold leading-none tracking-[-.02em] tabular-nums truncate" style={{ color: cor ?? 'var(--navy)' }}>{n}</div>
      <div className="lbl mt-1.5">{l}</div>
      {s && <div className="text-[11px] text-muted mt-0.5">{s}</div>}
    </div>
  )
}

function Bloco({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-line rounded-box shadow-card p-4">
      <div className="flex items-center gap-2 mb-3"><h3 className="text-[14px]">{titulo}</h3><span className="flex-1" />{acao}</div>
      {children}
    </section>
  )
}

function Vazio({ children }: { children: React.ReactNode }) { return <div className="text-[12.5px] text-muted py-4 text-center">{children}</div> }

function Barras({ itens }: { itens: { rotulo: string; valor: number; cor: string }[] }) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <div className="flex flex-col gap-1.5">
      {itens.map((i) => (
        <div key={i.rotulo} className="flex items-center gap-2 text-[12.5px]">
          <span className="w-[130px] truncate text-ink" title={i.rotulo}>{i.rotulo}</span>
          <div className="flex-1 h-4 bg-soft2 rounded-badge overflow-hidden"><div className="h-full rounded-badge transition-[width] duration-500" style={{ width: `${(i.valor / max) * 100}%`, background: i.cor }} /></div>
          <span className="font-mono tabular-nums w-6 text-right text-navy">{i.valor}</span>
        </div>
      ))}
    </div>
  )
}
