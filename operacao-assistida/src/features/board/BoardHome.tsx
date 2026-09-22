import { useMemo } from 'react'
import { format } from 'date-fns'
import { useBoards, useBoard, useCards, useUsuarios } from './useBoard'
import { useReconciliacao } from './reconciliacao'
import { useFinalizarCard } from './mutations'
import { Kanban } from '@/features/kanban/Kanban'
import type { Derivados } from '@/features/kanban/CardKanban'
import { PainelCard } from '@/features/card/PainelCard'
import { ModalDesfecho } from '@/features/card/ModalDesfecho'
import { BarraVisoes } from '@/features/visoes/BarraVisoes'
import { Lista } from '@/features/lista/Lista'
import { LinhaDoTempo } from '@/features/timeline/LinhaDoTempo'
import { Calendario } from '@/features/calendario/Calendario'
import { Painel } from '@/features/painel/Painel'
import { ConfigFases } from '@/features/config/ConfigFases'
import { Importar } from '@/features/importacao/Importar'
import { ConfigIntegracaoTela } from '@/features/integracao/ConfigIntegracao'
import { useConfigIntegracao, useSincronizacao } from '@/features/integracao/useIntegracao'
import { useUI } from '@/store/uiStore'
import { hojeISO } from '@/domain/datas'
import { aguardandoFinalizacao, calcularSaude, foraDaEsteira, fasesOrdenadas } from '@/domain/esteira'
import { aplicarFiltros, filtrosAtivos } from '@/domain/filtros'

export function BoardHome() {
  const boards = useBoards()
  const boardAtivoId = useUI((s) => s.boardAtivoId)
  const setBoardAtivo = useUI((s) => s.setBoardAtivo)
  const telaConfig = useUI((s) => s.telaConfig)
  const abrirConfig = useUI((s) => s.abrirConfig)
  const boardId = boards.data?.find((b) => b.id === boardAtivoId)?.id ?? boards.data?.[0]?.id
  const board = useBoard(boardId)
  const cards = useCards(boardId)
  const usuarios = useUsuarios()
  const visao = useUI((s) => s.visao)
  const filtros = useUI((s) => s.filtros)
  const abrirQuickAdd = useUI((s) => s.abrirQuickAdd)
  const abrirDesfecho = useUI((s) => s.abrirDesfecho)
  const finalizandoCardId = useUI((s) => s.finalizandoCardId)
  const mostrarFinalizados = useUI((s) => s.mostrarFinalizados)
  const alternarFinalizados = useUI((s) => s.alternarFinalizados)

  const reconc = useReconciliacao(board.data ?? undefined, cards.data)
  const configIntegracao = useConfigIntegracao(boardId)
  const sync = useSincronizacao(board.data ?? undefined, cards.data, configIntegracao.data)
  const fases = useMemo(() => fasesOrdenadas(board.data?.fases ?? []), [board.data?.fases])
  const finalizar = useFinalizarCard(boardId ?? '', fases)

  // Regras de tempo aplicadas ao vivo — um cálculo por card, compartilhado por todas as visões.
  const derivados = useMemo(() => {
    const m = new Map<string, Derivados>()
    if (!board.data || !cards.data) return m
    const fuso = board.data.configuracoes.fusoHorario
    const hoje = hojeISO(fuso)
    for (const c of cards.data) {
      m.set(c.id, {
        saude: calcularSaude(c, fases, hoje, fuso),
        fora: foraDaEsteira(c, fases, hoje, fuso),
        aguardando: aguardandoFinalizacao(c, fases, hoje, fuso),
      })
    }
    return m
  }, [board.data, cards.data, fases])

  const filtrados = useMemo(
    () => (cards.data ? aplicarFiltros(cards.data, filtros, (c) => derivados.get(c.id)?.saude ?? c.saude) : []),
    [cards.data, filtros, derivados],
  )

  if (boards.isError || board.isError || cards.isError) {
    return (
      <div className="rounded-ctl border border-red/30 bg-red/5 p-3.5 text-[13px]">
        <b className="text-red">Não foi possível carregar o quadro.</b>{' '}
        <span>Verifique a conexão e tente de novo.</span>{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => { boards.refetch(); board.refetch(); cards.refetch() }}>Tentar de novo</button>
      </div>
    )
  }

  if (!board.data || !cards.data) return <SkeletonQuadro />

  const todos = cards.data
  const ativos = todos.filter((c) => c.status === 'ativo' || c.status === 'pausado')
  const finalizados = todos.filter((c) => c.status === 'finalizado')
  const emRisco = ativos.filter((c) => derivados.get(c.id)?.saude === 'vermelho').length
  const aguardando = ativos.filter((c) => derivados.get(c.id)?.aguardando)
  const cardFinalizando = todos.find((c) => c.id === finalizandoCardId) ?? null
  const nFiltros = filtrosAtivos(filtros)
  const lista = usuarios.data ?? []

  return (
    <section>
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[22px]">{board.data.nome}</h2>
            {(boards.data?.length ?? 0) > 1 && (
              <select className="!w-auto !py-1 !text-[12.5px]" value={board.data.id} onChange={(e) => setBoardAtivo(e.target.value)} aria-label="Trocar quadro">
                {boards.data!.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            )}
            <button className="btn btn-soft btn-sm" onClick={() => abrirConfig('fases')} title="Fases, ciclo, templates e campos">⚙ Configurar</button>
            <button className="btn btn-soft btn-sm" onClick={() => abrirConfig('importar')} title="Importar clientes de CSV ou tabela colada">⇪ Importar</button>
            <button className={`btn btn-soft btn-sm ${configIntegracao.data?.ultimoErro ? '!text-red' : ''}`} onClick={() => abrirConfig('integracao')} title={configIntegracao.data?.ultimoErro ? `Erro na última sincronização: ${configIntegracao.data.ultimoErro}` : 'Configurar integração (Movidesk)'}>⇅ Integração{configIntegracao.data?.ultimoErro ? ' ⚠' : ''}</button>
          </div>
          <p className="text-muted text-[13px] mt-1">{board.data.descricao}</p>
        </div>
        <div className="flex-1" />
        <Stat n={ativos.length} l="clientes ativos" />
        <Stat n={emRisco} l="em risco" cor={emRisco ? 'var(--red)' : undefined} />
        <Stat n={aguardando.length} l="p/ finalizar" cor={aguardando.length ? 'var(--accent)' : undefined} />
        <Stat n={finalizados.length} l="finalizados" />
        <button className="btn btn-primary self-center" onClick={() => fases[0] && abrirQuickAdd(fases[0].id)} title="Atalho: N">
          + Novo cliente
        </button>
      </div>

      <BarraVisoes board={board.data} cards={todos} usuarios={lista} />

      {visao === 'kanban' && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap text-[12px] text-muted">
            <button className="btn btn-ghost btn-sm" onClick={reconc.executar} disabled={reconc.executando} title="Move para a fase esperada quem está atrás pelo tempo">
              {reconc.executando ? '…' : '↻'} Recalcular fases
            </button>
            <span className="font-mono">
              {reconc.ultima ? `última verificação ${format(new Date(reconc.ultima), 'HH:mm')}` : 'verificando…'} · automação {board.data.configuracoes.automacaoAtiva ? 'ligada' : 'desligada'} · à meia-noite ({board.data.configuracoes.fusoHorario})
            </span>
            {nFiltros > 0 && <span className="font-mono text-accent2">· mostrando {filtrados.filter((c) => c.status !== 'finalizado').length} de {ativos.length}</span>}
            <span className="flex-1" />
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" className="!w-auto" checked={mostrarFinalizados} onChange={alternarFinalizados} />
              Mostrar finalizados ({finalizados.length})
            </label>
          </div>

          {aguardando.length > 0 && (
            <div className="mb-3 rounded-box border border-accent/40 bg-accent/5 px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[11px] uppercase tracking-[.08em] text-accent font-semibold">⏳ Aguardando finalização</span>
              <span className="text-[13px] text-ink">
                {aguardando.length === 1 ? '1 cliente passou' : `${aguardando.length} clientes passaram`} do fim da esteira. Registre o desfecho para encerrar.
              </span>
              <span className="flex-1" />
              <span className="flex gap-1.5 flex-wrap">
                {aguardando.map((c) => (
                  <button key={c.id} className="btn btn-ghost btn-sm" onClick={() => abrirDesfecho(c.id)}>{c.clienteNome} →</button>
                ))}
              </span>
            </div>
          )}

          <Kanban board={board.data} cards={filtrados} usuarios={lista} derivados={derivados} />
          <p className="text-[11.5px] text-muted mt-2 font-mono">Arraste os cards entre as fases · <b>N</b> cria um cliente · <b>Esc</b> fecha · ● saúde · 📌 fixado</p>
        </>
      )}

      {visao === 'lista' && <Lista board={board.data} cards={filtrados} usuarios={lista} derivados={derivados} />}
      {visao === 'timeline' && <LinhaDoTempo board={board.data} cards={filtrados} usuarios={lista} derivados={derivados} />}
      {visao === 'calendario' && <Calendario board={board.data} cards={filtrados} />}
      {visao === 'painel' && <Painel board={board.data} cards={filtrados} usuarios={lista} derivados={derivados} />}

      {telaConfig === 'fases' && <ConfigFases board={board.data} cards={todos} onFechar={() => abrirConfig(null)} />}
      {telaConfig === 'importar' && <Importar board={board.data} usuarios={lista} onFechar={() => abrirConfig(null)} />}
      {telaConfig === 'integracao' && <ConfigIntegracaoTela board={board.data} onFechar={() => abrirConfig(null)} onSincronizar={sync.sincronizar} sincronizando={sync.executando} />}

      <PainelCard board={board.data} cards={todos} usuarios={lista} derivados={derivados} />
      <ModalDesfecho
        card={cardFinalizando}
        ocupado={finalizar.isPending}
        onFechar={() => abrirDesfecho(null)}
        onConfirmar={(d) => { if (cardFinalizando) { finalizar.mutate({ card: cardFinalizando, ...d }); abrirDesfecho(null); useUI.getState().abrirCard(null) } }}
      />
    </section>
  )
}

function Stat({ n, l, cor }: { n: number | string; l: string; cor?: string }) {
  return (
    <div className="bg-card border border-line rounded-box px-3.5 py-2.5 shadow-card min-w-[96px]">
      <div className="font-mono text-[24px] font-semibold leading-none tracking-[-.02em] tabular-nums" style={{ color: cor ?? 'var(--navy)' }}>{n}</div>
      <div className="lbl mt-1.5">{l}</div>
    </div>
  )
}

function SkeletonQuadro() {
  return (
    <div aria-busy="true" aria-label="Carregando quadro">
      <div className="skel h-7 w-64 mb-2" />
      <div className="skel h-4 w-96 mb-6" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shrink-0 w-[280px] rounded-box border border-line bg-soft3 p-2.5 flex flex-col gap-2">
            <div className="skel h-5 w-32 mb-1" />
            {Array.from({ length: (i % 3) + 1 }).map((_, j) => <div key={j} className="skel h-[84px]" />)}
          </div>
        ))}
      </div>
    </div>
  )
}
