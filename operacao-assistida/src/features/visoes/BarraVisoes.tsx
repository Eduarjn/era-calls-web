import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Board, Card, Usuario, Visao, VisaoSalva } from '@/domain/types'
import { ROTULO_PRIORIDADE, ROTULO_SAUDE } from '@/domain/prazo'
import { filtrosAtivos } from '@/domain/filtros'
import { getRepository } from '@/data'
import { useUI } from '@/store/uiStore'
import { MultiSelect } from '@/ui/MultiSelect'

const VISOES: { id: Visao; rotulo: string; icone: string }[] = [
  { id: 'kanban', rotulo: 'Kanban', icone: '▦' },
  { id: 'lista', rotulo: 'Lista', icone: '☰' },
  { id: 'timeline', rotulo: 'Linha do tempo', icone: '⟶' },
  { id: 'calendario', rotulo: 'Calendário', icone: '▤' },
  { id: 'painel', rotulo: 'Painel', icone: '◔' },
]

interface Props { board: Board; cards: Card[]; usuarios: Usuario[] }

/** Seletor de visão + busca + filtros combináveis + visões salvas. */
export function BarraVisoes({ board, cards, usuarios }: Props) {
  const visao = useUI((s) => s.visao)
  const setVisao = useUI((s) => s.setVisao)
  const filtros = useUI((s) => s.filtros)
  const setFiltros = useUI((s) => s.setFiltros)
  const limpar = useUI((s) => s.limparFiltros)
  const notificar = useUI((s) => s.notificar)
  const qc = useQueryClient()

  const [busca, setBusca] = useState(filtros.busca)
  useEffect(() => { const t = setTimeout(() => setFiltros({ busca }), 180); return () => clearTimeout(t) }, [busca, setFiltros])
  useEffect(() => { setBusca(filtros.busca) }, [filtros.busca])

  const visoes = useQuery({ queryKey: ['visoes', board.id], queryFn: () => getRepository().listarVisoes(board.id) })
  const salvar = useMutation({
    mutationFn: (nome: string) => getRepository().salvarVisao({ boardId: board.id, nome, visao, filtros }),
    onSuccess: (v) => { qc.invalidateQueries({ queryKey: ['visoes', board.id] }); notificar({ mensagem: `Visão "${v.nome}" salva` }) },
    onError: () => notificar({ mensagem: 'Não deu para salvar a visão.' }),
  })
  const excluir = useMutation({
    mutationFn: (id: string) => getRepository().excluirVisao(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visoes', board.id] }),
  })

  const fases = board.fases.filter((f) => !f.arquivada).sort((a, b) => a.ordem - b.ordem)
  const tags = [...new Set(cards.flatMap((c) => c.tags))].sort()
  const n = filtrosAtivos(filtros)

  function aplicarVisao(v: VisaoSalva) { setVisao(v.visao); useUI.setState({ filtros: v.filtros }) }

  return (
    <div className="flex flex-col gap-2.5 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex border border-line rounded-ctl overflow-hidden bg-card" role="tablist" aria-label="Modo de visualização">
          {VISOES.map((v) => (
            <button
              key={v.id} role="tab" aria-selected={visao === v.id}
              onClick={() => setVisao(v.id)}
              className={`px-3 py-1.5 text-[13px] font-semibold transition-colors border-r border-line last:border-r-0 ${visao === v.id ? 'bg-navy text-bg2' : 'text-muted hover:text-navy hover:bg-card2'}`}
            >
              <span className="mr-1.5 opacity-70" aria-hidden>{v.icone}</span>{v.rotulo}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <VisoesSalvas lista={visoes.data ?? []} onAplicar={aplicarVisao} onExcluir={(id) => excluir.mutate(id)} onSalvar={() => { const nome = prompt('Nome da visão:'); if (nome?.trim()) salvar.mutate(nome.trim()) }} />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          className="!w-[240px] !py-1.5 !text-[13px]"
          placeholder="Buscar cliente, código, tag…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar"
        />
        <MultiSelect rotulo="Responsável" opcoes={usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))} valores={filtros.responsavelIds} onChange={(v) => setFiltros({ responsavelIds: v })} />
        <MultiSelect rotulo="Fase" opcoes={fases.map((f) => ({ valor: f.id, rotulo: f.nome, cor: f.cor }))} valores={filtros.faseIds} onChange={(v) => setFiltros({ faseIds: v })} />
        <MultiSelect rotulo="Saúde" opcoes={(['verde', 'amarelo', 'vermelho'] as const).map((s) => ({ valor: s, rotulo: ROTULO_SAUDE[s], cor: `var(--${s === 'verde' ? 'green' : s === 'amarelo' ? 'amber' : 'red'})` }))} valores={filtros.saudes} onChange={(v) => setFiltros({ saudes: v as Card['saude'][] })} />
        <MultiSelect rotulo="Prioridade" opcoes={(Object.keys(ROTULO_PRIORIDADE) as Card['prioridade'][]).map((p) => ({ valor: p, rotulo: ROTULO_PRIORIDADE[p] }))} valores={filtros.prioridades} onChange={(v) => setFiltros({ prioridades: v as Card['prioridade'][] })} />
        <MultiSelect rotulo="Tag" opcoes={tags.map((t) => ({ valor: t, rotulo: t }))} valores={filtros.tags} onChange={(v) => setFiltros({ tags: v })} />
        <MultiSelect rotulo="Status" opcoes={[['ativo', 'Ativo'], ['pausado', 'Pausado'], ['finalizado', 'Finalizado'], ['cancelado', 'Cancelado']].map(([v, r]) => ({ valor: v!, rotulo: r! }))} valores={filtros.status} onChange={(v) => setFiltros({ status: v as Card['status'][] })} />
        <span className="inline-flex items-center gap-1 text-[12px] text-muted">
          <span className="lbl">entrada</span>
          <input type="date" className="!w-auto !py-1 !text-[12px]" value={filtros.entradaDe ?? ''} onChange={(e) => setFiltros({ entradaDe: e.target.value || undefined })} aria-label="Entrada de" />
          <span>–</span>
          <input type="date" className="!w-auto !py-1 !text-[12px]" value={filtros.entradaAte ?? ''} onChange={(e) => setFiltros({ entradaAte: e.target.value || undefined })} aria-label="Entrada até" />
        </span>
        {n > 0 && <button className="btn btn-soft btn-sm" onClick={() => { limpar(); setBusca('') }}>Limpar {n} filtro{n > 1 ? 's' : ''}</button>}
      </div>
    </div>
  )
}

function VisoesSalvas({ lista, onAplicar, onExcluir, onSalvar }: { lista: VisaoSalva[]; onAplicar: (v: VisaoSalva) => void; onExcluir: (id: string) => void; onSalvar: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {lista.length > 0 && (
        <select className="!w-auto !py-1.5 !text-[13px]" defaultValue="" onChange={(e) => { const v = lista.find((x) => x.id === e.target.value); if (v) onAplicar(v); e.target.value = '' }} aria-label="Visões salvas">
          <option value="" disabled>Visões salvas…</option>
          {lista.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
        </select>
      )}
      <button className="btn btn-soft btn-sm" onClick={onSalvar} title="Salvar a visão e os filtros atuais com um nome">💾 Salvar visão</button>
      {lista.length > 0 && (
        <button className="btn btn-soft btn-sm" onClick={() => { const nome = prompt('Excluir qual visão? Digite o nome exato:\n' + lista.map((v) => '• ' + v.nome).join('\n')); const v = lista.find((x) => x.nome === nome?.trim()); if (v) onExcluir(v.id) }} title="Excluir uma visão salva">🗑</button>
      )}
    </div>
  )
}
