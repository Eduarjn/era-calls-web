import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Board, Card, TipoEvento, Usuario } from '@/domain/types'
import { getRepository } from '@/data'
import { badgePrazo, ROTULO_PRIORIDADE, ROTULO_SAUDE } from '@/domain/prazo'
import { noFuso } from '@/domain/datas'
import { faseEsperada } from '@/domain/esteira'
import { useUI } from '@/store/uiStore'
import { useAtualizarCard, useCriarCard, useExcluirCard, useMoverCard } from '@/features/board/mutations'
import { useUsuarioAtual } from '@/features/board/useBoard'
import type { Derivados } from '@/features/kanban/CardKanban'
import { RegistroRapido } from '@/features/historico/RegistroRapido'
import { Timeline } from '@/features/historico/Timeline'
import { ProximaAcao } from '@/features/historico/ProximaAcao'
import { chaveEventos, useExcluirEvento } from '@/features/historico/mutations'
import { BlocoIntegracao } from '@/features/integracao/BlocoIntegracao'
import { Avatar, Badge } from '@/ui/Badge'

interface Props {
  board: Board
  cards: Card[]
  usuarios: Usuario[]
  derivados: Map<string, Derivados>
}

const ROTULO_RESULTADO: Record<NonNullable<Card['resultadoFinal']>, string> = {
  estabilizado: 'Estabilizado', prorrogado: 'Prorrogado', escalado: 'Escalado', churn: 'Churn',
}

const fmt = (iso: string, fuso: string) => format(noFuso(iso, fuso), "dd 'de' MMM", { locale: ptBR })
const paraInputDate = (iso: string, fuso: string) => format(noFuso(iso, fuso), 'yyyy-MM-dd')

type Aba = 'dados' | 'historico'

/** Painel lateral do cliente: situação na esteira, dados editáveis e histórico de acionamentos. */
export function PainelCard({ board, cards, usuarios, derivados }: Props) {
  const id = useUI((s) => s.cardAbertoId)
  const fechar = () => useUI.getState().abrirCard(null)
  const abrirDesfecho = useUI((s) => s.abrirDesfecho)
  const card = cards.find((c) => c.id === id) ?? null
  const fuso = board.configuracoes.fusoHorario
  const fases = board.fases.filter((f) => !f.arquivada).sort((a, b) => a.ordem - b.ordem)
  const der = card ? derivados.get(card.id) : undefined
  const esperada = card ? faseEsperada(card, fases, undefined, fuso) : null
  const finalizado = card?.status === 'finalizado'

  const [aba, setAba] = useState<Aba>('dados')
  const [sugestao, setSugestao] = useState<{ tipo?: TipoEvento; titulo?: string } | undefined>()

  const salvar = useAtualizarCard(board.id)
  const mover = useMoverCard(board.id, fases)
  const excluir = useExcluirCard(board.id)
  const criar = useCriarCard(board.id)
  const usuarioAtual = useUsuarioAtual()
  const camposExtras = board.configuracoes.camposCustomizados ?? []
  const excluirEvento = useExcluirEvento(card?.id ?? '')

  const eventos = useQuery({
    queryKey: chaveEventos(id ?? ''),
    queryFn: () => getRepository().listarEventos(id!),
    enabled: !!id,
  })
  const manuais = eventos.data?.filter((e) => !e.geradoPeloSistema).length ?? 0

  useEffect(() => { setAba('dados'); setSugestao(undefined) }, [id])
  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])

  const patch = (p: Parameters<typeof salvar.mutate>[0]['patch']) => card && salvar.mutate({ id: card.id, patch: p })

  function registrarDaAcao(titulo: string) {
    setSugestao({ tipo: 'ligacao', titulo })
    setAba('historico')
  }

  return (
    <AnimatePresence>
      {card && (
        <>
          <motion.div key="fundo" className="fixed inset-0 z-30 bg-navy/25 backdrop-blur-[1px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fechar} />
          <motion.aside
            key="painel"
            role="dialog" aria-modal="true" aria-label={`Cliente ${card.clienteNome}`}
            className="fixed top-0 right-0 z-40 h-full w-full max-w-[560px] bg-modal border-l border-line shadow-lift flex flex-col"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            {/* Cabeçalho */}
            <div className="px-5 pt-4 pb-0 border-b border-line" style={{ boxShadow: `inset 0 3px 0 ${fases.find((f) => f.id === card.faseId)?.cor ?? 'var(--accent)'}` }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] text-muted">{card.codigo}</span>
                {finalizado
                  ? <Badge cor="neutro">✓ {ROTULO_RESULTADO[card.resultadoFinal ?? 'estabilizado']}</Badge>
                  : <Badge cor={badgePrazo(card).cor}>{badgePrazo(card).rotulo}</Badge>}
                {der && !finalizado && <Badge cor={der.saude === 'verde' ? 'verde' : der.saude === 'amarelo' ? 'amarelo' : 'vermelho'}>● {ROTULO_SAUDE[der.saude]}</Badge>}
                {card.travadoManualmente && <Badge cor="neutro">📌 fixado</Badge>}
                <span className="flex-1" />
                <button className="btn btn-soft btn-sm" onClick={fechar} aria-label="Fechar painel">Esc ✕</button>
              </div>
              <input
                className="!border-transparent !bg-transparent !px-0 !py-1 !text-[20px] font-bold !text-navy mt-1 focus:!border-line"
                defaultValue={card.clienteNome}
                key={card.id + card.clienteNome}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== card.clienteNome) patch({ clienteNome: v }) }}
                aria-label="Nome do cliente"
              />
              <nav className="flex gap-0.5 mt-1 -mb-px" aria-label="Seções do cliente">
                {(['dados', 'historico'] as Aba[]).map((a) => (
                  <button key={a} className={`vtab !py-2 !px-3 !text-[13px] ${aba === a ? 'active' : ''}`} onClick={() => setAba(a)} aria-current={aba === a ? 'page' : undefined}>
                    {a === 'dados' ? 'Dados' : `Histórico${manuais ? ` (${manuais})` : ''}`}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {/* Situação na esteira (sempre visível) */}
              {finalizado ? (
                <div className="rounded-box border border-line bg-soft2 p-3.5 text-[13px]">
                  <div className="lbl mb-1">Desfecho</div>
                  <div className="font-semibold text-navy">{ROTULO_RESULTADO[card.resultadoFinal ?? 'estabilizado']} · saiu em {card.dataSaidaReal ? fmt(card.dataSaidaReal, fuso) : '—'}</div>
                  {card.justificativaResultado && <p className="mt-1 text-ink whitespace-pre-wrap">{card.justificativaResultado}</p>}
                  <button className="btn btn-ghost btn-sm mt-2.5" onClick={() => patch({ status: 'ativo', resultadoFinal: undefined, justificativaResultado: undefined, dataSaidaReal: undefined })}>Reabrir cliente</button>
                </div>
              ) : der?.aguardando ? (
                <div className="rounded-box border border-accent/40 bg-accent/5 p-3.5 text-[13px] flex items-center gap-3 flex-wrap">
                  <div className="flex-1">
                    <div className="font-semibold text-navy">⏳ Passou do fim da esteira ({esperada?.diasDecorridos} dias)</div>
                    <div className="text-muted mt-0.5">O sistema não finaliza sozinho. Registre o desfecho para encerrar.</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => abrirDesfecho(card.id)}>Finalizar</button>
                </div>
              ) : der?.fora ? (
                <div className="rounded-box border border-amber/40 bg-amber/8 p-3.5 text-[13px] flex items-center gap-3 flex-wrap">
                  <div className="flex-1">
                    <div className="font-semibold text-navy">{der.fora === 'atras' ? '↶' : '↷'} Fora da esteira</div>
                    <div className="text-muted mt-0.5">Pelo tempo, deveria estar em <b>{fases.find((f) => f.id === esperada?.faseId)?.nome}</b> ({esperada?.diasDecorridos} dias desde a entrada).{card.travadoManualmente ? ' Está fixado, por isso não avança sozinho.' : ''}</div>
                  </div>
                  {esperada && <button className="btn btn-ghost btn-sm" onClick={() => mover.mutate({ card, paraFaseId: esperada.faseId })}>Realinhar</button>}
                </div>
              ) : (
                <div className="text-[12.5px] text-muted flex items-center gap-2">
                  <span className="text-green">●</span> Na fase esperada pelo tempo ({esperada?.diasDecorridos ?? 0} dias desde a entrada).
                  <span className="flex-1" />
                  <button className="btn btn-soft btn-sm" onClick={() => abrirDesfecho(card.id)}>Finalizar agora</button>
                </div>
              )}

              {aba === 'dados' && (
                <>
                  {!finalizado && (
                    <ProximaAcao key={card.id + (card.proximaAcao?.dataPrazo ?? '')} card={card} usuarios={usuarios} usuarioAtual={usuarioAtual.data ?? undefined} boardId={board.id} fuso={fuso} onRegistrar={registrarDaAcao} />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Campo rotulo="Fase">
                      <select value={card.faseId} disabled={finalizado} onChange={(e) => mover.mutate({ card, paraFaseId: e.target.value })}>
                        {fases.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                      </select>
                    </Campo>
                    <Campo rotulo="Responsável">
                      <select value={card.responsavelId ?? ''} onChange={(e) => patch({ responsavelId: e.target.value || undefined })}>
                        <option value="">Sem responsável</option>
                        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                      </select>
                    </Campo>
                    <Campo rotulo="Entrada">
                      <input type="date" value={paraInputDate(card.dataEntrada, fuso)} onChange={(e) => e.target.value && patch({ dataEntrada: new Date(e.target.value + 'T00:00:00').toISOString() })} />
                    </Campo>
                    <Campo rotulo="Saída prevista">
                      <input type="date" value={paraInputDate(card.dataPrevistaSaida, fuso)} onChange={(e) => e.target.value && patch({ dataPrevistaSaida: new Date(e.target.value + 'T00:00:00').toISOString() })} />
                    </Campo>
                    <Campo rotulo="Prioridade">
                      <select value={card.prioridade} onChange={(e) => patch({ prioridade: e.target.value as Card['prioridade'] })}>
                        {(Object.keys(ROTULO_PRIORIDADE) as Card['prioridade'][]).map((p) => <option key={p} value={p}>{ROTULO_PRIORIDADE[p]}</option>)}
                      </select>
                    </Campo>
                    <Campo rotulo={card.saudeManual ? 'Saúde (manual)' : 'Saúde (automática)'}>
                      <select value={card.saudeManual ?? 'auto'} onChange={(e) => patch({ saudeManual: e.target.value === 'auto' ? undefined : (e.target.value as Card['saude']) })}>
                        <option value="auto">Automática · {der ? ROTULO_SAUDE[der.saude] : '—'}</option>
                        {(Object.keys(ROTULO_SAUDE) as Card['saude'][]).map((s) => <option key={s} value={s}>Forçar: {ROTULO_SAUDE[s]}</option>)}
                      </select>
                    </Campo>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                      <input type="checkbox" className="!w-auto" checked={card.travadoManualmente} onChange={(e) => patch({ travadoManualmente: e.target.checked })} />
                      📌 Fixar (não avança sozinho)
                    </label>
                    <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                      <input type="checkbox" className="!w-auto" checked={card.status === 'pausado'} onChange={(e) => patch({ status: e.target.checked ? 'pausado' : 'ativo' })} />
                      ⏸ Pausado
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Campo rotulo="Contato principal">
                      <input defaultValue={card.contatoPrincipal?.nome ?? ''} key={'cn' + card.id} placeholder="Nome" onBlur={(e) => patch({ contatoPrincipal: { ...card.contatoPrincipal, nome: e.target.value } })} />
                    </Campo>
                    <Campo rotulo="E-mail">
                      <input defaultValue={card.contatoPrincipal?.email ?? ''} key={'ce' + card.id} placeholder="email@cliente.com" onBlur={(e) => patch({ contatoPrincipal: { nome: card.contatoPrincipal?.nome ?? '', ...card.contatoPrincipal, email: e.target.value } })} />
                    </Campo>
                    <Campo rotulo="Telefone">
                      <input defaultValue={card.contatoPrincipal?.telefone ?? ''} key={'ct' + card.id} placeholder="(00) 00000-0000" onBlur={(e) => patch({ contatoPrincipal: { nome: card.contatoPrincipal?.nome ?? '', ...card.contatoPrincipal, telefone: e.target.value } })} />
                    </Campo>
                    <Campo rotulo="Id externo (Movidesk)">
                      <input defaultValue={card.clienteId ?? ''} key={'ci' + card.id} placeholder="—" onBlur={(e) => patch({ clienteId: e.target.value || undefined })} />
                    </Campo>
                    <Campo rotulo="Segmento">
                      <input defaultValue={card.segmento ?? ''} key={'sg' + card.id} onBlur={(e) => patch({ segmento: e.target.value })} />
                    </Campo>
                    <Campo rotulo="Produto / plano">
                      <input defaultValue={card.produtoPlano ?? ''} key={'pp' + card.id} onBlur={(e) => patch({ produtoPlano: e.target.value })} />
                    </Campo>
                  </div>

                  <BlocoIntegracao card={card} boardId={board.id} usuarioAtual={usuarioAtual.data ?? undefined} />

                  <Campo rotulo="Tags (separadas por vírgula)">
                    <input defaultValue={card.tags.join(', ')} key={'tg' + card.id} onBlur={(e) => patch({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
                  </Campo>

                  {camposExtras.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {camposExtras.map((cc) => {
                        const v = card.camposCustomizados[cc.chave]
                        const set = (nv: string | number | boolean | null) => patch({ camposCustomizados: { ...card.camposCustomizados, [cc.chave]: nv } })
                        return (
                          <Campo key={cc.chave} rotulo={cc.rotulo}>
                            {cc.tipo === 'booleano' ? <input type="checkbox" className="!w-auto" checked={!!v} onChange={(e) => set(e.target.checked)} />
                              : cc.tipo === 'lista' ? <select value={String(v ?? '')} onChange={(e) => set(e.target.value || null)}><option value="">—</option>{(cc.opcoes ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
                              : <input type={cc.tipo === 'numero' ? 'number' : cc.tipo === 'data' ? 'date' : 'text'} defaultValue={v == null ? '' : String(v)} key={cc.chave + card.id} onBlur={(e) => set(e.target.value === '' ? null : cc.tipo === 'numero' ? Number(e.target.value) : e.target.value)} />}
                          </Campo>
                        )
                      })}
                    </div>
                  )}

                  <div>
                    <div className="lbl mb-2">Checklist da fase · {card.checklist.filter((i) => i.feito).length}/{card.checklist.length}</div>
                    <div className="flex flex-col gap-1.5">
                      {card.checklist.map((item) => (
                        <label key={item.id} className="flex items-start gap-2 text-[13.5px] cursor-pointer">
                          <input type="checkbox" className="!w-auto mt-[3px]" checked={item.feito}
                            onChange={(e) => patch({ checklist: card.checklist.map((i) => i.id === item.id ? { ...i, feito: e.target.checked, feitoEm: e.target.checked ? new Date().toISOString() : undefined } : i) })} />
                          <span className={item.feito ? 'line-through text-muted' : ''}>{item.texto}</span>
                        </label>
                      ))}
                      {card.checklist.length === 0 && <span className="text-[12.5px] text-muted">Esta fase não tem checklist.</span>}
                    </div>
                  </div>
                </>
              )}

              {aba === 'historico' && (
                <>
                  {!finalizado && (
                    <RegistroRapido card={card} usuarioAtual={usuarioAtual.data ?? undefined} boardId={board.id} fuso={fuso} sugestao={sugestao} onRegistrado={() => setSugestao(undefined)} />
                  )}
                  <Timeline eventos={eventos.data} carregando={eventos.isLoading} usuarios={usuarios} fuso={fuso} onExcluir={(e) => excluirEvento.mutate(e)} />
                </>
              )}
            </div>

            {/* Rodapé */}
            <div className="px-5 py-3 border-t border-line flex items-center gap-2 text-[12px] text-muted">
              <Avatar nome={usuarios.find((u) => u.id === card.responsavelId)?.nome ?? '—'} tamanho={20} />
              <span>Entrou em {fmt(card.dataEntrada, fuso)} · sai em {fmt(card.dataPrevistaSaida, fuso)}</span>
              <span className="flex-1" />
              <button className="btn btn-soft btn-sm" title="Cria uma cópia com entrada hoje" onClick={async () => {
                const { id: _id, codigo: _c, criadoEm: _cr, atualizadoEm: _at, dataEntrada: _de, dataPrevistaSaida: _dp, dataSaidaReal: _ds, dataEntradaNaFase: _df, checklist: _ck, status: _st, resultadoFinal: _rf, justificativaResultado: _jr, ...resto } = card
                const novo = await criar.mutateAsync({ ...resto, boardId: card.boardId, faseId: fases[0]?.id ?? card.faseId, clienteNome: `${card.clienteNome} (cópia)` })
                useUI.getState().abrirCard(novo.id)
              }}>Duplicar</button>
              <button className="btn btn-soft btn-sm !text-red" onClick={() => { if (confirm(`Excluir ${card.clienteNome}? Dá para desfazer logo em seguida.`)) { excluir.mutate(card); fechar() } }}>Excluir</button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="lbl block mb-1.5">{rotulo}</span>
      {children}
    </label>
  )
}
