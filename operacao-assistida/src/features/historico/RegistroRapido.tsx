import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import type { Anexo, Card, TipoEvento, Usuario } from '@/domain/types'
import { INFO_TIPO, TIPOS_MANUAIS } from './tipos'
import { useCriarEvento } from './mutations'
import { useAtualizarCard } from '@/features/board/mutations'

interface Props {
  card: Card
  usuarioAtual?: Usuario
  boardId: string
  fuso: string
  /** Pré-preenche a partir da próxima ação (quando o usuário clica "Registrar" nela). */
  sugestao?: { tipo?: TipoEvento; titulo?: string }
  onRegistrado?: () => void
}

const agoraLocal = () => format(new Date(), "yyyy-MM-dd'T'HH:mm")

/**
 * Registro de acionamento em poucos cliques: tipo → título → (opcional) detalhes.
 * Ctrl/Cmd+Enter salva. Pode já deixar a próxima ação marcada.
 */
export function RegistroRapido({ card, usuarioAtual, boardId, sugestao, onRegistrado }: Props) {
  const [tipo, setTipo] = useState<TipoEvento>(sugestao?.tipo ?? 'ligacao')
  const [titulo, setTitulo] = useState(sugestao?.titulo ?? '')
  const [descricao, setDescricao] = useState('')
  const [dataHora, setDataHora] = useState(agoraLocal)
  const [duracao, setDuracao] = useState('')
  const [link, setLink] = useState('')
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [detalhes, setDetalhes] = useState(false)
  const [proxima, setProxima] = useState({ ativa: false, descricao: '', data: '' })
  const tituloRef = useRef<HTMLInputElement>(null)

  const criar = useCriarEvento(card.id)
  const salvarCard = useAtualizarCard(boardId)
  const info = INFO_TIPO[tipo]

  useEffect(() => { if (sugestao) { if (sugestao.tipo) setTipo(sugestao.tipo); if (sugestao.titulo) setTitulo(sugestao.titulo); tituloRef.current?.focus() } }, [sugestao])

  const valido = titulo.trim().length >= 2

  async function salvar() {
    if (!valido) return
    await criar.mutateAsync({
      cardId: card.id, tipo, titulo: titulo.trim(), descricao: descricao.trim() || undefined,
      dataHora: new Date(dataHora).toISOString(),
      autorId: usuarioAtual?.id, autorNome: usuarioAtual?.nome ?? 'Você',
      duracaoMin: info.temDuracao && duracao ? Number(duracao) : undefined,
      linkExterno: link.trim() || undefined,
      anexos, origem: 'manual', geradoPeloSistema: false,
    })
    if (proxima.ativa && proxima.descricao.trim() && proxima.data) {
      salvarCard.mutate({ id: card.id, patch: { proximaAcao: { descricao: proxima.descricao.trim(), dataPrazo: new Date(proxima.data + 'T12:00:00').toISOString(), responsavelId: card.responsavelId } } })
    }
    setTitulo(''); setDescricao(''); setDuracao(''); setLink(''); setAnexos([]); setDataHora(agoraLocal()); setProxima({ ativa: false, descricao: '', data: '' })
    tituloRef.current?.focus()
    onRegistrado?.()
  }

  function adicionarArquivo(files: FileList | null) {
    if (!files) return
    // TODO: integração — subir para o Storage do Supabase e guardar a URL pública.
    const novos: Anexo[] = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2), nome: f.name, url: URL.createObjectURL(f), tipo: f.type, tamanhoBytes: f.size, criadoEm: new Date().toISOString(),
    }))
    setAnexos((a) => [...a, ...novos])
  }

  function adicionarLink() {
    const url = prompt('Endereço do anexo (link):')
    if (!url) return
    setAnexos((a) => [...a, { id: Math.random().toString(36).slice(2), nome: url.replace(/^https?:\/\//, '').slice(0, 40), url, criadoEm: new Date().toISOString() }])
  }

  return (
    <div
      className="bg-card border border-line rounded-box p-3 shadow-card"
      style={{ borderLeft: `3px solid ${info.cor}` }}
      onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); salvar() } }}
    >
      <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Tipo de acionamento">
        {TIPOS_MANUAIS.map((t) => {
          const i = INFO_TIPO[t]
          const ativo = t === tipo
          return (
            <button
              key={t} type="button" role="radio" aria-checked={ativo}
              onClick={() => setTipo(t)}
              className={`rounded-ctl border px-2 py-1 text-[12px] font-semibold transition-colors ${ativo ? 'text-white' : 'border-line text-muted hover:text-navy hover:border-muted'}`}
              style={ativo ? { background: i.cor, borderColor: i.cor } : undefined}
            >
              {i.icone} {i.rotulo}
            </button>
          )
        })}
      </div>

      <input
        ref={tituloRef}
        className="mt-2.5"
        placeholder={`O que aconteceu na ${info.rotulo.toLowerCase()}?`}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        aria-label="Título do acionamento"
        onKeyDown={(e) => { if (e.key === 'Enter' && !detalhes) { e.preventDefault(); salvar() } }}
      />

      {detalhes && (
        <div className="mt-2.5 flex flex-col gap-2.5">
          <textarea rows={3} placeholder="Detalhes (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} aria-label="Detalhes" />
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block"><span className="lbl block mb-1">Quando</span><input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} /></label>
            {info.temDuracao && <label className="block"><span className="lbl block mb-1">Duração (min)</span><input type="number" min={0} value={duracao} onChange={(e) => setDuracao(e.target.value)} placeholder="15" /></label>}
            {info.temLink && <label className="block"><span className="lbl block mb-1">Link do ticket</span><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…movidesk.com/…" /></label>}
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[12px]">
            <span className="lbl">Anexos</span>
            <label className="btn btn-soft btn-sm cursor-pointer">📎 Arquivo<input type="file" multiple className="sr-only" onChange={(e) => adicionarArquivo(e.target.files)} /></label>
            <button type="button" className="btn btn-soft btn-sm" onClick={adicionarLink}>🔗 Link</button>
            {anexos.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1 rounded-badge bg-soft2 px-1.5 py-1 font-mono text-[11px]">
                {a.nome}<button type="button" className="opacity-60 hover:opacity-100" onClick={() => setAnexos((x) => x.filter((y) => y.id !== a.id))} aria-label={`Remover ${a.nome}`}>✕</button>
              </span>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" className="!w-auto" checked={proxima.ativa} onChange={(e) => setProxima((p) => ({ ...p, ativa: e.target.checked }))} />
            Definir próxima ação
          </label>
          {proxima.ativa && (
            <div className="grid grid-cols-[1fr_150px] gap-2.5">
              <input placeholder="Ex.: ligar para confirmar treinamento" value={proxima.descricao} onChange={(e) => setProxima((p) => ({ ...p, descricao: e.target.value }))} aria-label="Próxima ação" />
              <input type="date" value={proxima.data} onChange={(e) => setProxima((p) => ({ ...p, data: e.target.value }))} aria-label="Prazo da próxima ação" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2.5">
        <button type="button" className="btn btn-primary btn-sm" onClick={salvar} disabled={!valido || criar.isPending}>Registrar</button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setDetalhes((d) => !d)}>{detalhes ? 'Menos' : 'Detalhes, anexos, próxima ação'}</button>
        <span className="flex-1" />
        <span className="text-[11px] text-muted font-mono">Ctrl+Enter salva</span>
      </div>
    </div>
  )
}
