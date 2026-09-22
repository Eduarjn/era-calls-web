import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Board, CampoCustomizado, Card, Fase, TemplateBoard } from '@/domain/types'
import { PALETA_FASES } from '@/domain/seed'
import { getRepository } from '@/data'
import { useConfigBoard } from './mutations'

interface Props { board: Board; cards: Card[]; onFechar: () => void }

const ROTULO_REGRA = { apos_dias_na_fase: 'Avança ao completar os dias na fase', na_data_alvo: 'Avança na data-alvo da esteira', nunca: 'Nunca avança sozinho' } as const

/** Tela de gerenciamento: fases (drag para reordenar), regras de tempo, templates, campos customizados. */
export function ConfigFases({ board, cards, onFechar }: Props) {
  const m = useConfigBoard(board.id)
  const fases = [...board.fases].sort((a, b) => a.ordem - b.ordem)
  const ativas = fases.filter((f) => !f.arquivada)
  const arquivadas = fases.filter((f) => f.arquivada)
  const [aba, setAba] = useState<'fases' | 'board' | 'templates' | 'campos'>('fases')
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => getRepository().listarTemplates() })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const ids = ativas.map((f) => f.id)
    const nova = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    m.reordenar.mutate([...nova, ...arquivadas.map((f) => f.id)])
  }

  function novaFase() {
    const ordem = fases.length
    m.criarFase.mutate({ nome: 'Nova fase', ordem, cor: PALETA_FASES[ordem % PALETA_FASES.length]!, tipo: 'andamento', duracaoDias: 7, regraAutoAvanco: { tipo: 'apos_dias_na_fase' }, checklistPadrao: [], arquivada: false })
  }

  return (
    <div className="fixed inset-0 z-40 bg-navy/30 backdrop-blur-[1px] grid place-items-center p-4" onClick={onFechar}>
      <div className="w-full max-w-[860px] max-h-[92vh] bg-modal border border-line rounded-box shadow-lift flex flex-col" style={{ borderTop: '3px solid var(--accent)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Configurar quadro">
        <div className="px-5 pt-4 pb-0 border-b border-line">
          <div className="flex items-center gap-2"><h3 className="text-[19px]">Configurar · {board.nome}</h3><span className="flex-1" /><button className="btn btn-soft btn-sm" onClick={onFechar}>Esc ✕</button></div>
          <nav className="flex gap-0.5 mt-2 -mb-px">
            {([['fases', 'Fases'], ['board', 'Ciclo e automação'], ['templates', 'Templates'], ['campos', 'Campos customizados']] as const).map(([id, r]) => (
              <button key={id} className={`vtab !py-2 !px-3 !text-[13px] ${aba === id ? 'active' : ''}`} onClick={() => setAba(id)}>{r}</button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {aba === 'fases' && (
            <>
              <p className="text-[13px] text-muted mb-3">Arraste para reordenar. Cada fase define quantos dias o cliente fica nela e se avança sozinho.</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={ativas.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2">
                    {ativas.map((f) => <LinhaFase key={f.id} fase={f} fases={ativas} nCards={cards.filter((c) => c.faseId === f.id).length} m={m} />)}
                  </div>
                </SortableContext>
              </DndContext>
              <button className="btn btn-ghost btn-sm mt-3" onClick={novaFase}>+ Nova fase</button>
              {arquivadas.length > 0 && (
                <div className="mt-5">
                  <div className="lbl mb-2">Arquivadas</div>
                  {arquivadas.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-[13px] py-1.5 border-t border-line"><span className="w-2.5 h-2.5 rounded-full" style={{ background: f.cor }} />{f.nome}<span className="text-muted font-mono text-[11px]">{cards.filter((c) => c.faseId === f.id).length} cliente(s)</span><span className="flex-1" /><button className="btn btn-soft btn-sm" onClick={() => m.atualizarFase.mutate({ id: f.id, patch: { arquivada: false } })}>Restaurar</button></div>
                  ))}
                </div>
              )}
            </>
          )}

          {aba === 'board' && (
            <div className="grid grid-cols-2 gap-4 max-w-[560px]">
              <label className="block col-span-2"><span className="lbl block mb-1.5">Nome do quadro</span><input defaultValue={board.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== board.nome && m.atualizarBoard.mutate({ nome: e.target.value.trim() })} /></label>
              <label className="block col-span-2"><span className="lbl block mb-1.5">Descrição</span><input defaultValue={board.descricao ?? ''} onBlur={(e) => e.target.value !== (board.descricao ?? '') && m.atualizarBoard.mutate({ descricao: e.target.value })} /></label>
              <label className="block"><span className="lbl block mb-1.5">Duração do ciclo (dias)</span><input type="number" min={1} defaultValue={board.configuracoes.duracaoCicloDias} onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== board.configuracoes.duracaoCicloDias) m.atualizarBoard.mutate({ configuracoes: { ...board.configuracoes, duracaoCicloDias: v } }) }} /></label>
              <label className="block"><span className="lbl block mb-1.5">Fuso horário</span><select value={board.configuracoes.fusoHorario} onChange={(e) => m.atualizarBoard.mutate({ configuracoes: { ...board.configuracoes, fusoHorario: e.target.value } })}>{['America/Sao_Paulo', 'America/Manaus', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Cuiaba', 'America/Rio_Branco', 'UTC'].map((z) => <option key={z} value={z}>{z}</option>)}</select></label>
              <label className="flex items-center gap-2 text-[13.5px] col-span-2 cursor-pointer"><input type="checkbox" className="!w-auto" checked={board.configuracoes.automacaoAtiva} onChange={(e) => m.atualizarBoard.mutate({ configuracoes: { ...board.configuracoes, automacaoAtiva: e.target.checked } })} />Movimentar clientes automaticamente pelo tempo</label>
              <p className="text-[12.5px] text-muted col-span-2">A soma das fases de entrada e andamento hoje é <b>{ativas.filter((f) => f.tipo !== 'conclusao').reduce((s, f) => s + f.duracaoDias, 0)} dias</b>. A saída prevista de um cliente novo usa a duração do ciclo ({board.configuracoes.duracaoCicloDias} dias).</p>
            </div>
          )}

          {aba === 'templates' && (
            <div className="flex flex-col gap-4">
              <div className="bg-soft3 border border-line rounded-box p-3.5 flex items-center gap-3 flex-wrap">
                <div className="flex-1 text-[13px]"><b className="text-navy">Salvar este quadro como template</b><div className="text-muted">Guarda as fases, durações, regras e checklists para reaplicar depois.</div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => { const nome = prompt('Nome do template:', `${board.nome} (${board.configuracoes.duracaoCicloDias} dias)`); if (nome?.trim()) m.salvarTemplate.mutate({ nome: nome.trim(), descricao: board.descricao, configuracoes: board.configuracoes, fases: ativas.map(({ id: _i, boardId: _b, ...f }) => f) }) }}>💾 Salvar como template</button>
              </div>
              <div className="lbl">Templates disponíveis</div>
              {(templates.data ?? []).map((t: TemplateBoard) => (
                <div key={t.id} className="border border-line rounded-box p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]"><div className="font-semibold text-[14px] text-navy">{t.nome}</div><div className="text-[12.5px] text-muted">{t.descricao} · {t.fases.length} fases · ciclo {t.configuracoes.duracaoCicloDias} d</div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">{t.fases.map((f, i) => <span key={i} className="rounded-badge px-1.5 py-0.5 font-mono text-[10px] text-white" style={{ background: f.cor }}>{f.nome}</span>)}</div></div>
                  <button className="btn btn-primary btn-sm" onClick={() => { const nome = prompt('Nome do novo quadro:', t.nome); if (nome?.trim()) m.criarBoard.mutate({ nome: nome.trim(), template: t }) }}>Criar quadro</button>
                  {!t.id.startsWith('tpl-') && <button className="btn btn-soft btn-sm" onClick={() => confirm(`Excluir template "${t.nome}"?`) && m.excluirTemplate.mutate(t.id)}>🗑</button>}
                </div>
              ))}
              <p className="text-[12px] text-muted">Aplicar um template cria um quadro novo (troque de quadro no topo da página). O quadro atual não é alterado.</p>
            </div>
          )}

          {aba === 'campos' && <CamposCustomizados board={board} onSalvar={(campos) => m.atualizarBoard.mutate({ configuracoes: { ...board.configuracoes, camposCustomizados: campos } })} />}
        </div>
      </div>
    </div>
  )
}

function LinhaFase({ fase, fases, nCards, m }: { fase: Fase; fases: Fase[]; nCards: number; m: ReturnType<typeof useConfigBoard> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fase.id })
  const [aberta, setAberta] = useState(false)
  const patch = (p: Partial<Omit<Fase, 'id' | 'boardId'>>) => m.atualizarFase.mutate({ id: fase.id, patch: p })

  function excluir() {
    if (nCards > 0) {
      const outras = fases.filter((f) => f.id !== fase.id)
      const escolha = prompt(`"${fase.nome}" tem ${nCards} cliente(s). Para qual fase eles vão? Digite o número:\n` + outras.map((f, i) => `${i + 1}. ${f.nome}`).join('\n'))
      const idx = Number(escolha) - 1
      if (!outras[idx]) return
      m.excluirFase.mutate({ id: fase.id, destinoId: outras[idx]!.id })
    } else if (confirm(`Excluir a fase "${fase.nome}"?`)) {
      m.excluirFase.mutate({ id: fase.id, destinoId: null })
    }
  }

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, borderLeft: `3px solid ${fase.cor}` }} className={`bg-card border border-line rounded-box ${isDragging ? 'shadow-lift opacity-90' : 'shadow-card'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button className="cursor-grab active:cursor-grabbing text-muted px-1 touch-none" {...attributes} {...listeners} aria-label={`Reordenar ${fase.nome}`} title="Arrastar">⠿</button>
        <input className="!w-[200px] !py-1 !text-[13.5px] font-semibold" defaultValue={fase.nome} key={fase.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== fase.nome && patch({ nome: e.target.value.trim() })} aria-label="Nome da fase" />
        <span className="font-mono text-[11px] text-muted">{nCards} cliente(s)</span>
        <span className="flex-1" />
        <select className="!w-auto !py-1 !text-[12px]" value={fase.tipo} onChange={(e) => patch({ tipo: e.target.value as Fase['tipo'] })} aria-label="Tipo"><option value="entrada">Entrada</option><option value="andamento">Andamento</option><option value="conclusao">Conclusão</option></select>
        <label className="flex items-center gap-1 text-[12px] text-muted"><input type="number" min={0} className="!w-[62px] !py-1 !text-[12px]" defaultValue={fase.duracaoDias} key={'d' + fase.duracaoDias} onBlur={(e) => Number(e.target.value) !== fase.duracaoDias && patch({ duracaoDias: Math.max(0, Number(e.target.value)) })} aria-label="Duração em dias" />dias</label>
        <button className="btn btn-soft btn-sm" onClick={() => setAberta((a) => !a)}>{aberta ? 'Menos' : 'Mais'}</button>
      </div>
      {aberta && (
        <div className="px-3 pb-3 pt-1 border-t border-line grid grid-cols-2 gap-3 text-[13px]">
          <label className="block"><span className="lbl block mb-1.5">Regra de automação</span>
            <select value={fase.regraAutoAvanco.tipo} onChange={(e) => patch({ regraAutoAvanco: { tipo: e.target.value as Fase['regraAutoAvanco']['tipo'] } })}>{(Object.keys(ROTULO_REGRA) as (keyof typeof ROTULO_REGRA)[]).map((k) => <option key={k} value={k}>{ROTULO_REGRA[k]}</option>)}</select></label>
          <label className="block"><span className="lbl block mb-1.5">Limite de clientes (WIP)</span><input type="number" min={0} defaultValue={fase.limiteWIP ?? ''} key={'w' + fase.limiteWIP} placeholder="sem limite" onBlur={(e) => patch({ limiteWIP: e.target.value ? Number(e.target.value) : undefined })} /></label>
          <div className="col-span-2"><span className="lbl block mb-1.5">Cor</span>
            <div className="flex gap-1.5 flex-wrap">{PALETA_FASES.map((c) => <button key={c} className={`w-6 h-6 rounded-ctl border-2 ${fase.cor === c ? 'border-navy scale-110' : 'border-transparent'}`} style={{ background: c }} onClick={() => patch({ cor: c })} aria-label={`Cor ${c}`} />)}<input type="color" value={fase.cor} onChange={(e) => patch({ cor: e.target.value })} className="!w-8 !h-6 !p-0 !border-0" aria-label="Cor personalizada" /></div></div>
          <label className="block col-span-2"><span className="lbl block mb-1.5">Checklist padrão (um item por linha)</span>
            <textarea rows={3} defaultValue={fase.checklistPadrao.join('\n')} key={'c' + fase.checklistPadrao.join('|')} onBlur={(e) => { const itens = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); if (itens.join('|') !== fase.checklistPadrao.join('|')) patch({ checklistPadrao: itens }) }} /></label>
          <div className="col-span-2 flex gap-2"><button className="btn btn-soft btn-sm" onClick={() => patch({ arquivada: true })}>Arquivar</button><button className="btn btn-soft btn-sm !text-red" onClick={excluir}>Excluir</button></div>
        </div>
      )}
    </div>
  )
}

function CamposCustomizados({ board, onSalvar }: { board: Board; onSalvar: (c: CampoCustomizado[]) => void }) {
  const campos = board.configuracoes.camposCustomizados ?? []
  const [novo, setNovo] = useState<CampoCustomizado>({ chave: '', rotulo: '', tipo: 'texto' })
  function adicionar() {
    const rotulo = novo.rotulo.trim(); if (!rotulo) return
    const chave = rotulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (campos.some((c) => c.chave === chave)) return
    onSalvar([...campos, { ...novo, rotulo, chave, opcoes: novo.tipo === 'lista' ? (novo.opcoes ?? []) : undefined }])
    setNovo({ chave: '', rotulo: '', tipo: 'texto' })
  }
  return (
    <div className="max-w-[600px]">
      <p className="text-[13px] text-muted mb-3">Campos extras que aparecem na aba Dados de todo cliente deste quadro.</p>
      {campos.map((c) => (
        <div key={c.chave} className="flex items-center gap-2 py-2 border-b border-line text-[13px]"><b className="text-navy">{c.rotulo}</b><span className="font-mono text-[11px] text-muted">{c.chave} · {c.tipo}{c.opcoes?.length ? ` (${c.opcoes.join(', ')})` : ''}</span><span className="flex-1" /><button className="btn btn-soft btn-sm" onClick={() => onSalvar(campos.filter((x) => x.chave !== c.chave))}>Remover</button></div>
      ))}
      <div className="grid grid-cols-[1fr_140px_auto] gap-2 mt-3 items-end">
        <label className="block"><span className="lbl block mb-1.5">Rótulo</span><input value={novo.rotulo} onChange={(e) => setNovo({ ...novo, rotulo: e.target.value })} placeholder="Ex.: Nº de ramais" onKeyDown={(e) => e.key === 'Enter' && adicionar()} /></label>
        <label className="block"><span className="lbl block mb-1.5">Tipo</span><select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as CampoCustomizado['tipo'] })}><option value="texto">Texto</option><option value="numero">Número</option><option value="data">Data</option><option value="booleano">Sim/não</option><option value="lista">Lista</option></select></label>
        <button className="btn btn-ghost" onClick={adicionar}>Adicionar</button>
        {novo.tipo === 'lista' && <label className="block col-span-3"><span className="lbl block mb-1.5">Opções (separadas por vírgula)</span><input onChange={(e) => setNovo({ ...novo, opcoes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></label>}
      </div>
    </div>
  )
}
