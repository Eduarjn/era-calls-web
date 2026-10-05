import { useState } from 'react'
import { format } from 'date-fns'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { modoRepository } from '@/data'
import { chaves } from '@/features/board/useBoard'
import { useUI } from '@/store/uiStore'

/**
 * Aba 👥 Usuários (só administrador): criar, ajustar papel/nome/senha, bloquear e excluir.
 * Tudo passa pela Edge Function `oa-usuarios` (service role no servidor). O login vale para
 * a Inteligência de Calls inteira, não só para a Operação Assistida.
 */

export const PAPEIS: { id: string; nome: string; desc: string }[] = [
  { id: 'gestor', nome: 'Administrador', desc: 'Tudo, inclusive gerenciar usuários' },
  { id: 'vendedor', nome: 'Usuário', desc: 'Vê e edita, sem gerenciar usuários' },
  { id: 'visualizador', nome: 'Somente visualização', desc: 'Só vê; não cria, edita nem apaga nada' },
]
export const ACESSOS = [{ id: 'todos', nome: 'Todos os menus' }, { id: 'oa', nome: 'Só Operação Assistida' }]
const nomeAcesso = (a?: string) => ACESSOS.find((x) => x.id === a)?.nome ?? 'Todos os menus'
const nomePapel = (p?: string) => PAPEIS.find((x) => x.id === p)?.nome ?? (p === 'marketing' ? 'Usuário (marketing)' : p ?? '—')

interface UsuarioAdm {
  id: string; nome?: string; email?: string; papel?: string
  ultimoAcesso?: string; criadoEm?: string; bloqueado?: boolean; acesso?: string; bloqueioAuto?: string; voce?: boolean
}

async function chamar<T = { ok: true }>(body: Record<string, unknown>): Promise<T> {
  if (modoRepository() === 'mock') throw new Error('Modo de exemplo: gestão de usuários só funciona conectado ao Supabase.')
  const { data, error } = await supabase.functions.invoke('oa-usuarios', { body })
  if (error) {
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(corpo?.erro ?? error.message)
  }
  if (data?.erro) throw new Error(data.erro)
  return data as T
}

export function Usuarios({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  const lista = useQuery({ queryKey: ['usuarios-adm'], queryFn: () => chamar<UsuarioAdm[]>({ acao: 'listar' }) })
  const [novo, setNovo] = useState({ nome: '', email: '', senha: '', papel: 'visualizador', acesso: 'todos' })
  const [editando, setEditando] = useState<string | null>(null)
  const [edicao, setEdicao] = useState({ nome: '', papel: '', senha: '', acesso: 'todos' })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function executar(chave: string, fn: () => Promise<unknown>, ok: string) {
    setOcupado(chave); setErro(null)
    try {
      await fn()
      await Promise.all([qc.invalidateQueries({ queryKey: ['usuarios-adm'] }), qc.invalidateQueries({ queryKey: chaves.usuarios })])
      notificar({ mensagem: ok })
      return true
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e)); return false
    } finally { setOcupado(null) }
  }

  const criar = () => executar('criar', () => chamar({ acao: 'criar', ...novo }), `Usuário ${novo.email} criado`)
    .then((ok) => ok && setNovo({ nome: '', email: '', senha: '', papel: 'visualizador', acesso: 'todos' }))

  const salvar = (u: UsuarioAdm) => executar(u.id, () => chamar({
    acao: 'atualizar', id: u.id, nome: edicao.nome, papel: edicao.papel, acesso: edicao.acesso, ...(edicao.senha ? { senha: edicao.senha } : {}),
  }), `${edicao.nome || u.email} atualizado`).then((ok) => ok && setEditando(null))

  const bloquear = (u: UsuarioAdm) => {
    const acao = u.bloqueado ? 'desbloquear' : 'bloquear'
    if (!confirm(`${acao[0]!.toUpperCase() + acao.slice(1)} o acesso de ${u.nome || u.email}?${u.bloqueado ? '' : '\nEle não consegue mais entrar; calls e histórico continuam.'}`)) return
    executar(u.id, () => chamar({ acao: 'atualizar', id: u.id, bloqueado: !u.bloqueado }), `Acesso de ${u.nome || u.email} ${u.bloqueado ? 'liberado' : 'bloqueado'}`)
  }

  const excluir = (u: UsuarioAdm) => {
    if (!confirm(`Excluir ${u.nome || u.email} definitivamente?\nNão dá para desfazer.`)) return
    executar(u.id, () => chamar({ acao: 'excluir', id: u.id }), `${u.nome || u.email} excluído`)
  }

  const fmt = (iso?: string) => (iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm') : 'nunca')

  return (
    <div className="fixed inset-0 z-40 bg-navy/30 backdrop-blur-[1px] grid place-items-center p-4" onClick={onFechar}>
      <div className="w-full max-w-[980px] max-h-[92vh] bg-modal border border-line rounded-box shadow-lift flex flex-col" style={{ borderTop: '3px solid var(--accent)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Usuários">
        <div className="px-5 py-4 border-b border-line flex items-center gap-2">
          <h3 className="text-[19px]">👥 Usuários</h3>
          <span className="text-[12px] text-muted">o login vale para toda a Inteligência de Calls</span>
          <span className="flex-1" /><button className="btn btn-soft btn-sm" onClick={onFechar}>Esc ✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          <div className="rounded-box border border-line bg-soft3 p-3.5">
            <div className="lbl mb-2.5">Novo usuário</div>
            <div className="grid grid-cols-[1fr_1.3fr_1fr_1fr_1fr_auto] gap-2 items-end max-[800px]:grid-cols-2">
              <input placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} aria-label="Nome" />
              <input placeholder="e-mail@era.com.br" type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} aria-label="E-mail" />
              <input placeholder="Senha (mín. 8)" type="text" autoComplete="new-password" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} aria-label="Senha inicial" />
              <select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })} aria-label="Permissão">
                {PAPEIS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select value={novo.acesso} onChange={(e) => setNovo({ ...novo, acesso: e.target.value })} aria-label="Menus">
                {ACESSOS.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              <button className="btn btn-primary" disabled={ocupado === 'criar' || !novo.email || novo.senha.length < 8} onClick={criar}>{ocupado === 'criar' ? 'Criando…' : '+ Criar'}</button>
            </div>
            <div className="text-[12px] text-muted mt-2">{PAPEIS.find((p) => p.id === novo.papel)?.desc}. Passe a senha para a pessoa; ela entra com o e-mail e essa senha.</div>
          </div>

          {erro && <div className="rounded-ctl border border-red/30 bg-red/5 p-2.5 text-[13px] text-red">{erro}</div>}

          {lista.isLoading && <div className="text-[13px] text-muted">Carregando usuários…</div>}
          {lista.isError && <div className="text-[13px] text-red">Não deu para listar: {(lista.error as Error).message}</div>}

          {lista.data && (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11.5px] uppercase tracking-[.06em]">
                  <th className="py-1.5 pr-3 font-medium">Nome / e-mail</th><th className="pr-3 font-medium">Permissão / menus</th>
                  <th className="pr-3 font-medium">Último acesso</th><th className="font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.data.map((u) => editando === u.id ? (
                  <tr key={u.id} className="border-t border-line bg-soft3">
                    <td className="py-2 pr-3"><input value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} aria-label="Nome" /><div className="text-[11.5px] text-muted mt-1">{u.email}</div></td>
                    <td className="pr-3">
                      <select value={edicao.papel} onChange={(e) => setEdicao({ ...edicao, papel: e.target.value })} disabled={u.voce} title={u.voce ? 'Você não pode mudar a própria permissão' : undefined} aria-label="Permissão">
                        {PAPEIS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        {!PAPEIS.some((p) => p.id === edicao.papel) && <option value={edicao.papel}>{nomePapel(edicao.papel)}</option>}
                      </select>
                      <select className="mt-1" value={edicao.acesso} onChange={(e) => setEdicao({ ...edicao, acesso: e.target.value })} disabled={u.voce} aria-label="Menus">
                        {ACESSOS.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                      </select>
                    </td>
                    <td className="pr-3"><input type="text" autoComplete="new-password" placeholder="Nova senha (opcional)" value={edicao.senha} onChange={(e) => setEdicao({ ...edicao, senha: e.target.value })} aria-label="Nova senha" /></td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-primary btn-sm" disabled={ocupado === u.id || (!!edicao.senha && edicao.senha.length < 8)} onClick={() => salvar(u)}>{ocupado === u.id ? 'Salvando…' : 'Salvar'}</button>{' '}
                      <button className="btn btn-soft btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={u.id} className={`border-t border-line ${u.bloqueado ? 'opacity-60' : ''}`}>
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-navy">{u.nome || '—'}{u.voce && <span className="font-normal text-muted text-[11.5px]"> · você</span>}{u.bloqueado && <span className="ml-1.5 font-mono text-[10.5px] text-red" title={u.bloqueioAuto ? `3 senhas erradas em ${fmt(u.bloqueioAuto)}` : 'Bloqueado por um administrador'}>{u.bloqueioAuto ? 'BLOQUEADO · 3 SENHAS ERRADAS' : 'BLOQUEADO'}</span>}</div>
                      <div className="text-[12px] text-muted">{u.email}</div>
                    </td>
                    <td className="pr-3">{nomePapel(u.papel)}<div className="text-[11.5px] text-muted">{nomeAcesso(u.acesso)}</div></td>
                    <td className="pr-3 font-mono text-[12px] text-muted">{fmt(u.ultimoAcesso)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-soft btn-sm" disabled={!!ocupado} onClick={() => { setEditando(u.id); setEdicao({ nome: u.nome ?? '', papel: u.papel ?? 'vendedor', senha: '', acesso: u.acesso ?? 'todos' }); setErro(null) }}>Ajustar</button>{' '}
                      {!u.voce && <button className="btn btn-soft btn-sm" disabled={!!ocupado} onClick={() => bloquear(u)}>{u.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>}{' '}
                      {!u.voce && <button className="btn btn-soft btn-sm !text-red" disabled={!!ocupado} onClick={() => excluir(u)}>Excluir</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11.5px] text-muted">Quem já gravou calls não pode ser excluído (as calls seriam apagadas junto): use <b>Bloquear</b>, que corta o acesso e mantém os dados. Após 3 senhas erradas seguidas o acesso é bloqueado sozinho (menos administradores); <b>Desbloquear</b> libera e zera a contagem.</p>
        </div>
      </div>
    </div>
  )
}
