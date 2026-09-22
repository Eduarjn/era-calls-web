import { useMemo, useState } from 'react'
import type { Board, Card, NovoCard, Usuario } from '@/domain/types'
import { useCriarCard } from '@/features/board/mutations'
import { useUI } from '@/store/uiStore'

interface Props { board: Board; usuarios: Usuario[]; onFechar: () => void }

type Alvo = 'ignorar' | 'clienteNome' | 'clienteId' | 'dataEntrada' | 'responsavel' | 'segmento' | 'produtoPlano' | 'contatoNome' | 'contatoEmail' | 'contatoTelefone' | 'tags' | 'prioridade'
const ALVOS: { id: Alvo; rotulo: string }[] = [
  { id: 'ignorar', rotulo: '— ignorar —' }, { id: 'clienteNome', rotulo: 'Cliente (obrigatório)' }, { id: 'clienteId', rotulo: 'Id externo' }, { id: 'dataEntrada', rotulo: 'Data de entrada' },
  { id: 'responsavel', rotulo: 'Responsável (nome)' }, { id: 'segmento', rotulo: 'Segmento' }, { id: 'produtoPlano', rotulo: 'Produto/plano' }, { id: 'contatoNome', rotulo: 'Contato' },
  { id: 'contatoEmail', rotulo: 'E-mail' }, { id: 'contatoTelefone', rotulo: 'Telefone' }, { id: 'tags', rotulo: 'Tags' }, { id: 'prioridade', rotulo: 'Prioridade' },
]

/** Detecta separador e quebra em linhas/colunas (suporta aspas). */
export function parseTabela(texto: string): string[][] {
  const linhas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim())
  if (!linhas.length) return []
  const primeira = linhas[0]!
  const sep = primeira.includes('\t') ? '\t' : (primeira.split(';').length >= primeira.split(',').length ? ';' : ',')
  return linhas.map((l) => {
    const out: string[] = []; let atual = ''; let aspas = false
    for (let i = 0; i < l.length; i++) {
      const ch = l[i]!
      if (ch === '"') { if (aspas && l[i + 1] === '"') { atual += '"'; i++ } else aspas = !aspas }
      else if (ch === sep && !aspas) { out.push(atual); atual = '' }
      else atual += ch
    }
    out.push(atual)
    return out.map((s) => s.trim())
  })
}

function adivinhar(cabecalho: string): Alvo {
  const h = cabecalho.toLowerCase()
  if (/cliente|empresa|nome/.test(h) && !/contato|respons/.test(h)) return 'clienteNome'
  if (/entrada|in[ií]cio|data/.test(h)) return 'dataEntrada'
  if (/respons|cs|dono/.test(h)) return 'responsavel'
  if (/segmento|setor/.test(h)) return 'segmento'
  if (/produto|plano/.test(h)) return 'produtoPlano'
  if (/e-?mail/.test(h)) return 'contatoEmail'
  if (/telefone|celular|fone|whats/.test(h)) return 'contatoTelefone'
  if (/contato/.test(h)) return 'contatoNome'
  if (/tag/.test(h)) return 'tags'
  if (/priori/.test(h)) return 'prioridade'
  if (/\bid\b|c[oó]digo|movidesk/.test(h)) return 'clienteId'
  return 'ignorar'
}

function paraISO(v: string): string | undefined {
  const s = v.trim(); if (!s) return undefined
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (br) { const a = br[3]!.length === 2 ? '20' + br[3] : br[3]; return new Date(`${a}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}T00:00:00`).toISOString() }
  const d = new Date(s); return isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Importação em lote: colar tabela ou CSV → pré-visualização → mapeamento → importar. */
export function Importar({ board, usuarios, onFechar }: Props) {
  const [texto, setTexto] = useState('')
  const [temCabecalho, setTemCabecalho] = useState(true)
  const [mapa, setMapa] = useState<Alvo[]>([])
  const [faseId, setFaseId] = useState(board.fases.filter((f) => !f.arquivada).sort((a, b) => a.ordem - b.ordem)[0]?.id ?? '')
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null)
  const criar = useCriarCard(board.id)
  const notificar = useUI((s) => s.notificar)

  const tabela = useMemo(() => parseTabela(texto), [texto])
  const cabecalho = temCabecalho ? tabela[0] ?? [] : (tabela[0] ?? []).map((_, i) => `Coluna ${i + 1}`)
  const linhas = temCabecalho ? tabela.slice(1) : tabela
  const mapaEfetivo = cabecalho.map((h, i) => mapa[i] ?? adivinhar(h))
  const idxNome = mapaEfetivo.indexOf('clienteNome')
  const validas = linhas.filter((l) => idxNome >= 0 && (l[idxNome] ?? '').trim())

  function montar(l: string[]): NovoCard {
    const get = (a: Alvo) => { const i = mapaEfetivo.indexOf(a); return i >= 0 ? (l[i] ?? '').trim() : '' }
    const respNome = get('responsavel').toLowerCase()
    const resp = usuarios.find((u) => u.nome.toLowerCase() === respNome || u.email.toLowerCase() === respNome)
    const prio = get('prioridade').toLowerCase()
    return {
      boardId: board.id, faseId, clienteNome: get('clienteNome'), clienteId: get('clienteId') || undefined,
      dataEntrada: paraISO(get('dataEntrada')), responsavelId: resp?.id,
      segmento: get('segmento') || undefined, produtoPlano: get('produtoPlano') || undefined,
      contatoPrincipal: get('contatoNome') || get('contatoEmail') || get('contatoTelefone') ? { nome: get('contatoNome'), email: get('contatoEmail') || undefined, telefone: get('contatoTelefone') || undefined } : undefined,
      tags: get('tags') ? get('tags').split(/[;,|]/).map((t) => t.trim()).filter(Boolean) : [],
      prioridade: (['baixa', 'media', 'alta', 'critica'] as Card['prioridade'][]).find((p) => prio.startsWith(p.slice(0, 3))) ?? 'media',
    }
  }

  async function importar() {
    setProgresso({ feito: 0, total: validas.length })
    let ok = 0
    for (const l of validas) {
      try { await criar.mutateAsync(montar(l)); ok++ } catch { /* já notificado */ }
      setProgresso({ feito: ok, total: validas.length })
    }
    notificar({ mensagem: `${ok} cliente(s) importado(s)` })
    onFechar()
  }

  function lerArquivo(f: File | undefined) { if (!f) return; f.text().then(setTexto) }

  return (
    <div className="fixed inset-0 z-40 bg-navy/30 backdrop-blur-[1px] grid place-items-center p-4" onClick={onFechar}>
      <div className="w-full max-w-[900px] max-h-[92vh] bg-modal border border-line rounded-box shadow-lift flex flex-col" style={{ borderTop: '3px solid var(--accent)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Importar clientes">
        <div className="px-5 py-4 border-b border-line flex items-center gap-2"><h3 className="text-[19px]">Importar clientes em lote</h3><span className="flex-1" /><button className="btn btn-soft btn-sm" onClick={onFechar}>Esc ✕</button></div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {!tabela.length ? (
            <>
              <p className="text-[13px] text-muted">Cole uma tabela (do Excel, Google Sheets ou CSV) ou escolha um arquivo. A primeira linha pode ser o cabeçalho.</p>
              <textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={'Cliente;Entrada;Responsável;Segmento\nPadaria Doce Pão;05/09/2026;Ana Souza;varejo'} className="font-mono !text-[12.5px]" />
              <div className="flex items-center gap-3"><label className="btn btn-ghost btn-sm cursor-pointer">📂 Escolher CSV<input type="file" accept=".csv,.txt,.tsv" className="sr-only" onChange={(e) => lerArquivo(e.target.files?.[0])} /></label><span className="text-[12px] text-muted">Separador detectado automaticamente (; , ou tab).</span></div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap text-[13px]">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" className="!w-auto" checked={temCabecalho} onChange={(e) => setTemCabecalho(e.target.checked)} />Primeira linha é cabeçalho</label>
                <label className="flex items-center gap-1.5">Fase de entrada <select className="!w-auto !py-1 !text-[12.5px]" value={faseId} onChange={(e) => setFaseId(e.target.value)}>{board.fases.filter((f) => !f.arquivada).sort((a, b) => a.ordem - b.ordem).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>
                <span className="flex-1" />
                <span className="font-mono text-[12px] text-muted">{validas.length} de {linhas.length} linha(s) válidas</span>
                <button className="btn btn-soft btn-sm" onClick={() => { setTexto(''); setMapa([]) }}>Trocar dados</button>
              </div>
              {idxNome < 0 && <div className="rounded-ctl border border-amber/40 bg-amber/8 text-[13px] p-2.5">Marque qual coluna é o <b>Cliente</b> para conseguir importar.</div>}
              <div className="overflow-x-auto border border-line rounded-box">
                <table className="text-[12.5px] border-collapse w-full">
                  <thead>
                    <tr>{cabecalho.map((h, i) => (
                      <th key={i} className="text-left px-2 py-1.5 border-b border-line bg-soft3 min-w-[150px]">
                        <div className="font-mono text-[10.5px] text-muted truncate mb-1" title={h}>{h}</div>
                        <select className="!py-1 !text-[12px]" value={mapaEfetivo[i]} onChange={(e) => setMapa(() => { const n = [...mapaEfetivo]; n[i] = e.target.value as Alvo; return n })}>{ALVOS.map((a) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}</select>
                      </th>
                    ))}</tr>
                  </thead>
                  <tbody>{linhas.slice(0, 8).map((l, i) => <tr key={i} className="border-b border-line last:border-b-0">{cabecalho.map((_, j) => <td key={j} className={`px-2 py-1.5 truncate max-w-[220px] ${mapaEfetivo[j] === 'ignorar' ? 'text-muted' : ''}`}>{l[j]}</td>)}</tr>)}</tbody>
                </table>
                {linhas.length > 8 && <div className="text-[11.5px] text-muted px-2 py-1.5 font-mono">… e mais {linhas.length - 8} linha(s)</div>}
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-line flex items-center gap-2">
          {progresso && <span className="font-mono text-[12px] text-muted">importando {progresso.feito}/{progresso.total}…</span>}
          <span className="flex-1" />
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" disabled={!validas.length || !!progresso} onClick={importar}>Importar {validas.length || ''} cliente(s)</button>
        </div>
      </div>
    </div>
  )
}
