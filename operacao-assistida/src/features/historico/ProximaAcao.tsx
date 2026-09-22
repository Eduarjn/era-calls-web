import { useState } from 'react'
import { format } from 'date-fns'
import type { Card, Usuario } from '@/domain/types'
import { badgeProximaAcao } from '@/domain/prazo'
import { noFuso } from '@/domain/datas'
import { Badge } from '@/ui/Badge'
import { useAtualizarCard } from '@/features/board/mutations'
import { useCriarEvento } from './mutations'

interface Props {
  card: Card
  usuarios: Usuario[]
  usuarioAtual?: Usuario
  boardId: string
  fuso: string
  onRegistrar: (titulo: string) => void
}

/** Próxima ação do cliente: o que fazer, até quando e quem. Concluir gera evento no histórico. */
export function ProximaAcao({ card, usuarios, usuarioAtual, boardId, fuso, onRegistrar }: Props) {
  const salvar = useAtualizarCard(boardId)
  const criarEvento = useCriarEvento(card.id)
  const [editando, setEditando] = useState(!card.proximaAcao)
  const [descricao, setDescricao] = useState(card.proximaAcao?.descricao ?? '')
  const [data, setData] = useState(card.proximaAcao ? format(noFuso(card.proximaAcao.dataPrazo, fuso), 'yyyy-MM-dd') : '')
  const [resp, setResp] = useState(card.proximaAcao?.responsavelId ?? card.responsavelId ?? '')
  const badge = badgeProximaAcao(card)

  function gravar() {
    if (!descricao.trim() || !data) return
    salvar.mutate({ id: card.id, patch: { proximaAcao: { descricao: descricao.trim(), dataPrazo: new Date(data + 'T12:00:00').toISOString(), responsavelId: resp || undefined } } })
    setEditando(false)
  }

  function concluir() {
    if (!card.proximaAcao) return
    criarEvento.mutate({
      cardId: card.id, tipo: 'nota', titulo: `Próxima ação concluída: ${card.proximaAcao.descricao}`,
      dataHora: new Date().toISOString(), autorId: usuarioAtual?.id, autorNome: usuarioAtual?.nome ?? 'Você', origem: 'manual',
    })
    salvar.mutate({ id: card.id, patch: { proximaAcao: undefined } })
    setDescricao(''); setData(''); setEditando(true)
  }

  if (editando) {
    return (
      <div className="rounded-box border border-dashed border-line p-3">
        <div className="lbl mb-2">Próxima ação</div>
        <div className="grid grid-cols-[1fr_140px] gap-2">
          <input placeholder="O que precisa acontecer?" value={descricao} onChange={(e) => setDescricao(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && gravar()} aria-label="Descrição da próxima ação" />
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Prazo" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <select className="!w-auto !py-1.5 !text-[13px]" value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável pela ação">
            <option value="">Responsável…</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <span className="flex-1" />
          {card.proximaAcao && <button className="btn btn-soft btn-sm" onClick={() => setEditando(false)}>Cancelar</button>}
          <button className="btn btn-ghost btn-sm" onClick={gravar} disabled={!descricao.trim() || !data}>Salvar</button>
        </div>
      </div>
    )
  }

  const acao = card.proximaAcao!
  return (
    <div className="rounded-box border border-line bg-soft3 p-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><span className="lbl">Próxima ação</span>{badge && <Badge cor={badge.cor}>{badge.rotulo}</Badge>}</div>
        <div className="font-semibold text-[14px] text-navy mt-1">{acao.descricao}</div>
        <div className="text-[12px] text-muted mt-0.5 font-mono">até {format(noFuso(acao.dataPrazo, fuso), 'dd/MM')} · {usuarios.find((u) => u.id === acao.responsavelId)?.nome ?? 'sem responsável'}</div>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button className="btn btn-primary btn-sm" onClick={() => onRegistrar(acao.descricao)} title="Registrar o acionamento desta ação">Registrar</button>
        <button className="btn btn-soft btn-sm" onClick={concluir}>Concluir</button>
        <button className="btn btn-soft btn-sm" onClick={() => setEditando(true)}>Editar</button>
      </div>
    </div>
  )
}
