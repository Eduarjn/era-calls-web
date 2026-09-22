import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { Board, Card, Usuario } from '@/domain/types'
import { badgePrazo, ROTULO_PRIORIDADE, ROTULO_SAUDE } from '@/domain/prazo'
import { noFuso } from '@/domain/datas'
import { useUI } from '@/store/uiStore'
import { useAtualizarCard, useMoverCard } from '@/features/board/mutations'
import type { Derivados } from '@/features/kanban/CardKanban'
import { Avatar, Badge } from '@/ui/Badge'
import { exportarCSV, exportarXLSX, linhasParaExportar } from './exportar'

interface Props { board: Board; cards: Card[]; usuarios: Usuario[]; derivados: Map<string, Derivados> }

type Coluna = 'codigo' | 'cliente' | 'fase' | 'responsavel' | 'saude' | 'prioridade' | 'entrada' | 'saida' | 'acao' | 'status' | 'tags'
const COLUNAS: { id: Coluna; rotulo: string; padrao: boolean }[] = [
  { id: 'codigo', rotulo: 'Código', padrao: true }, { id: 'cliente', rotulo: 'Cliente', padrao: true }, { id: 'fase', rotulo: 'Fase', padrao: true },
  { id: 'responsavel', rotulo: 'Responsável', padrao: true }, { id: 'saude', rotulo: 'Saúde', padrao: true }, { id: 'prioridade', rotulo: 'Prioridade', padrao: true },
  { id: 'entrada', rotulo: 'Entrada', padrao: true }, { id: 'saida', rotulo: 'Saída prev.', padrao: true }, { id: 'acao', rotulo: 'Próxima ação', padrao: true },
  { id: 'status', rotulo: 'Status', padrao: false }, { id: 'tags', rotulo: 'Tags', padrao: false },
]
const COR_SAUDE = { verde: 'var(--green)', amarelo: 'var(--amber)', vermelho: 'var(--red)' } as const

/** Tabela ordenável e configurável, edição inline e ações em lote. */
export function Lista({ board, cards, usuarios, derivados }: Props) {
  const fuso = board.configuracoes.fusoHorario
  const fases = board.fases.filter((f) => !f.arquivada).sort((a, b) => a.ordem - b.ordem)
  const abrirCard = useUI((s) => s.abrirCard)
  const selecionados = useUI((s) => s.selecionados)
  const setSelecionados = useUI((s) => s.setSelecionados)
  const notificar = useUI((s) => s.notificar)
  const salvar = useAtualizarCard(board.id)
  const mover = useMoverCard(board.id, fases)

  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean }>({ col: 'entrada', asc: false })
  const [visiveis, setVisiveis] = useState<Coluna[]>(COLUNAS.filter((c) => c.padrao).map((c) => c.id))
  const [configurando, setConfigurando] = useState(false)

  const nome = (id?: string) => usuarios.find((u) => u.id === id)?.nome ?? ''
  const faseNome = (id: string) => fases.find((f) => f.id === id)
  const valor = (c: Card, col: Coluna): string | number => {
    switch (col) {
      case 'codigo': return c.codigo
      case 'cliente': return c.clienteNome.toLowerCase()
      case 'fase': return faseNome(c.faseId)?.ordem ?? 99
      case 'responsavel': return nome(c.responsavelId).toLowerCase()
      case 'saude': return ({ vermelho: 0, amarelo: 1, verde: 2 })[derivados.get(c.id)?.saude ?? c.saude]
      case 'prioridade': return ({ critica: 0, alta: 1, media: 2, baixa: 3 })[c.prioridade]
      case 'entrada': return c.dataEntrada
      case 'saida': return c.dataPrevistaSaida
      case 'acao': return c.proximaAcao?.dataPrazo ?? '9999'
      case 'status': return c.status
      case 'tags': return c.tags.join(',')
    }
  }
  const ordenados = useMemo(() => [...cards].sort((a, b) => { const x = valor(a, ordem.col), y = valor(b, ordem.col); const r = x < y ? -1 : x > y ? 1 : 0; return ordem.asc ? r : -r }), [cards, ordem, derivados]) // eslint-disable-line react-hooks/exhaustive-deps

  const todosMarcados = ordenados.length > 0 && ordenados.every((c) => selecionados.includes(c.id))
  const sel = ordenados.filter((c) => selecionados.includes(c.id))

  function emLote(fn: (c: Card) => void, msg: string) { sel.forEach(fn); notificar({ mensagem: `${sel.length} cliente(s): ${msg}` }); setSelecionados([]) }

  const th = (col: Coluna, rotulo: string) => (
    <th key={col} className="text-left px-2 py-2 font-mono text-[10.5px] uppercase tracking-[.06em] text-muted border-b border-line whitespace-nowrap cursor-pointer select-none hover:text-navy" onClick={() => setOrdem((o) => ({ col, asc: o.col === col ? !o.asc : true }))} aria-sort={ordem.col === col ? (ordem.asc ? 'ascending' : 'descending') : 'none'}>
      {rotulo}{ordem.col === col && <span className="ml-1">{ordem.asc ? '↑' : '↓'}</span>}
    </th>
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap text-[12.5px]">
        <span className="text-muted">{ordenados.length} cliente(s)</span>
        <span className="flex-1" />
        {sel.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap rounded-ctl border border-accent2/40 bg-accent2/5 px-2 py-1">
            <span className="font-semibold text-navy">{sel.length} selecionado(s):</span>
            <select className="!w-auto !py-1 !text-[12px]" defaultValue="" onChange={(e) => { const id = e.target.value; if (id) emLote((c) => mover.mutate({ card: c, paraFaseId: id, silencioso: true }), 'fase alterada'); e.target.value = '' }} aria-label="Mudar fase"><option value="" disabled>Mudar fase…</option>{fases.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            <select className="!w-auto !py-1 !text-[12px]" defaultValue="" onChange={(e) => { const id = e.target.value; if (id) emLote((c) => salvar.mutate({ id: c.id, patch: { responsavelId: id } }), 'responsável alterado'); e.target.value = '' }} aria-label="Mudar responsável"><option value="" disabled>Responsável…</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
            <button className="btn btn-soft btn-sm" onClick={() => { const d = prompt('Nova saída prevista (AAAA-MM-DD):'); if (d) emLote((c) => salvar.mutate({ id: c.id, patch: { dataPrevistaSaida: new Date(d + 'T00:00:00').toISOString() } }), 'prazo alterado') }}>Prazo</button>
            <button className="btn btn-soft btn-sm" onClick={() => { const t = prompt('Tag para adicionar:'); if (t?.trim()) emLote((c) => salvar.mutate({ id: c.id, patch: { tags: [...new Set([...c.tags, t.trim()])] } }), 'tag adicionada') }}>+ Tag</button>
            <button className="btn btn-soft btn-sm" onClick={() => setSelecionados([])}>✕</button>
          </div>
        )}
        <button className="btn btn-soft btn-sm" onClick={() => setConfigurando((c) => !c)}>⚙ Colunas</button>
        <button className="btn btn-soft btn-sm" onClick={() => exportarCSV(linhasParaExportar(ordenados, fases, usuarios, derivados))}>⬇ CSV</button>
        <button className="btn btn-soft btn-sm" onClick={() => exportarXLSX(linhasParaExportar(ordenados, fases, usuarios, derivados))}>⬇ XLSX</button>
      </div>
      {configurando && (
        <div className="flex gap-3 flex-wrap mb-2 text-[12.5px] bg-card border border-line rounded-box p-2.5">
          {COLUNAS.map((c) => <label key={c.id} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="!w-auto" checked={visiveis.includes(c.id)} onChange={(e) => setVisiveis((v) => e.target.checked ? [...v, c.id] : v.filter((x) => x !== c.id))} />{c.rotulo}</label>)}
        </div>
      )}

      <div className="overflow-x-auto bg-card border border-line rounded-box shadow-card">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-2 border-b border-line w-8"><input type="checkbox" className="!w-auto" checked={todosMarcados} onChange={(e) => setSelecionados(e.target.checked ? ordenados.map((c) => c.id) : [])} aria-label="Selecionar todos" /></th>
              {COLUNAS.filter((c) => visiveis.includes(c.id)).map((c) => th(c.id, c.rotulo))}
            </tr>
          </thead>
          <tbody>
            {ordenados.map((c) => {
              const d = derivados.get(c.id); const saude = d?.saude ?? c.saude; const f = faseNome(c.faseId); const prazo = badgePrazo(c)
              return (
                <tr key={c.id} className={`border-b border-line last:border-b-0 hover:bg-soft3 transition-colors ${selecionados.includes(c.id) ? 'bg-accent2/5' : ''}`}>
                  <td className="px-2 py-1.5"><input type="checkbox" className="!w-auto" checked={selecionados.includes(c.id)} onChange={(e) => setSelecionados(e.target.checked ? [...selecionados, c.id] : selecionados.filter((x) => x !== c.id))} aria-label={`Selecionar ${c.clienteNome}`} /></td>
                  {visiveis.includes('codigo') && <td className="px-2 py-1.5 font-mono text-[11.5px] text-muted whitespace-nowrap">{c.codigo}</td>}
                  {visiveis.includes('cliente') && <td className="px-2 py-1.5"><button className="font-semibold text-navy hover:text-accent2 text-left" onClick={() => abrirCard(c.id)}>{c.clienteNome}</button>{d?.aguardando && <Badge cor="vermelho" className="ml-1.5">⏳</Badge>}{d?.fora && <Badge cor="amarelo" className="ml-1.5">{d.fora === 'atras' ? '↶' : '↷'}</Badge>}</td>}
                  {visiveis.includes('fase') && <td className="px-2 py-1.5"><select className="!w-auto !py-1 !text-[12.5px] !border-transparent hover:!border-line !bg-transparent" style={{ color: f?.cor }} value={c.faseId} disabled={c.status === 'finalizado'} onChange={(e) => mover.mutate({ card: c, paraFaseId: e.target.value })}>{fases.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></td>}
                  {visiveis.includes('responsavel') && <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1.5"><Avatar nome={nome(c.responsavelId) || '—'} tamanho={18} /><select className="!w-auto !py-1 !text-[12.5px] !border-transparent hover:!border-line !bg-transparent" value={c.responsavelId ?? ''} onChange={(e) => salvar.mutate({ id: c.id, patch: { responsavelId: e.target.value || undefined } })}><option value="">—</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></span></td>}
                  {visiveis.includes('saude') && <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1.5 text-[12.5px]"><span className="w-2 h-2 rounded-full" style={{ background: COR_SAUDE[saude] }} />{ROTULO_SAUDE[saude]}</span></td>}
                  {visiveis.includes('prioridade') && <td className="px-2 py-1.5"><select className="!w-auto !py-1 !text-[12.5px] !border-transparent hover:!border-line !bg-transparent" value={c.prioridade} onChange={(e) => salvar.mutate({ id: c.id, patch: { prioridade: e.target.value as Card['prioridade'] } })}>{(Object.keys(ROTULO_PRIORIDADE) as Card['prioridade'][]).map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}</select></td>}
                  {visiveis.includes('entrada') && <td className="px-2 py-1.5 font-mono text-[12px] whitespace-nowrap">{format(noFuso(c.dataEntrada, fuso), 'dd/MM/yy')}</td>}
                  {visiveis.includes('saida') && <td className="px-2 py-1.5 whitespace-nowrap"><span className="font-mono text-[12px] mr-1.5">{format(noFuso(c.dataPrevistaSaida, fuso), 'dd/MM/yy')}</span>{c.status !== 'finalizado' && <Badge cor={prazo.cor}>{prazo.rotulo}</Badge>}</td>}
                  {visiveis.includes('acao') && <td className="px-2 py-1.5 text-[12.5px] max-w-[220px] truncate" title={c.proximaAcao?.descricao}>{c.proximaAcao ? <><span className="font-mono text-muted mr-1.5">{format(noFuso(c.proximaAcao.dataPrazo, fuso), 'dd/MM')}</span>{c.proximaAcao.descricao}</> : <span className="text-muted">—</span>}</td>}
                  {visiveis.includes('status') && <td className="px-2 py-1.5 text-[12.5px]">{c.status}{c.resultadoFinal ? ` · ${c.resultadoFinal}` : ''}</td>}
                  {visiveis.includes('tags') && <td className="px-2 py-1.5 text-[12px]">{c.tags.map((t) => <span key={t} className="inline-block rounded-badge bg-soft2 px-1.5 py-0.5 mr-1 font-mono text-[10.5px]">{t}</span>)}</td>}
                </tr>
              )
            })}
            {ordenados.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-muted text-[13px]">Nenhum cliente com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
