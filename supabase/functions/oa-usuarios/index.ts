// Edge Function: gestão de usuários da Inteligência de Calls / Operação Assistida (aba 👥 Usuários).
// Deploy: supabase functions deploy oa-usuarios
// Só administrador (perfis.papel = 'gestor') usa; tudo restrito à empresa dele.
//
// Excluir de verdade só quem não tem calls nem agenda: calls.user_id é ON DELETE CASCADE e
// apagar o usuário apagaria as calls. Para esses, "bloquear" (ban no Auth) corta o acesso e mantém os dados.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const PAPEIS = ['gestor', 'vendedor', 'marketing', 'visualizador'] as const
const ACESSOS = ['todos', 'oa'] as const // 'oa' = só Operação Assistida (em app_metadata.acesso, vai no token)
const BLOQUEIO = '876000h' // ~100 anos

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const auth = req.headers.get('Authorization') ?? ''
  const sbUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await sbUsuario.auth.getUser()
  if (!user) return json({ erro: 'Faça login.' }, 401)

  const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: eu } = await adm.from('perfis').select('papel, empresa').eq('id', user.id).maybeSingle()
  if (!eu || eu.papel !== 'gestor') return json({ erro: 'Apenas administrador gerencia usuários.' }, 403)

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')

  /** Alvo tem que ser da mesma empresa. */
  async function alvo() {
    const { data } = await adm.from('perfis').select('id, papel, empresa, nome, email').eq('id', id).maybeSingle()
    if (!data || data.empresa !== eu!.empresa) throw new Error('Usuário não encontrado.')
    return data
  }
  /** Não deixa a empresa sem administrador. */
  async function garanteOutroGestor() {
    const { count } = await adm.from('perfis').select('id', { count: 'exact', head: true }).eq('empresa', eu!.empresa).eq('papel', 'gestor').neq('id', id)
    if (!count) throw new Error('A empresa precisa de pelo menos um administrador.')
  }

  try {
    switch (body.acao) {
      case 'listar': {
        const { data: perfis, error } = await adm.from('perfis').select('id, nome, email, papel').eq('empresa', eu.empresa).order('nome')
        if (error) throw error
        const extras = new Map<string, { ultimoAcesso?: string; criadoEm?: string; bloqueado: boolean; acesso: string; bloqueioAuto?: string }>()
        for (let page = 1; page < 20; page++) {
          const { data } = await adm.auth.admin.listUsers({ page, perPage: 1000 })
          for (const u of data?.users ?? []) {
            const ban = (u as { banned_until?: string }).banned_until
            extras.set(u.id, { ultimoAcesso: u.last_sign_in_at ?? undefined, criadoEm: u.created_at, bloqueado: !!ban && new Date(ban) > new Date(), acesso: u.app_metadata?.acesso === 'oa' ? 'oa' : 'todos', bloqueioAuto: u.app_metadata?.bloqueio_auto_em ?? undefined })
          }
          if ((data?.users?.length ?? 0) < 1000) break
        }
        return json((perfis ?? []).map((p) => ({ ...p, ...extras.get(p.id), voce: p.id === user.id })))
      }

      case 'criar': {
        const email = String(body.email ?? '').trim().toLowerCase()
        const senha = String(body.senha ?? '')
        const nome = String(body.nome ?? '').trim()
        const papel = PAPEIS.includes(body.papel) ? body.papel : 'visualizador'
        if (!/^\S+@\S+\.\S+$/.test(email)) return json({ erro: 'E-mail inválido.' }, 400)
        if (senha.length < 8) return json({ erro: 'Senha com pelo menos 8 caracteres.' }, 400)
        const acesso = ACESSOS.includes(body.acesso) ? body.acesso : 'todos'
        const { data: novo, error } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome }, app_metadata: { acesso } })
        if (error) throw new Error(/already/i.test(error.message) ? 'Já existe usuário com esse e-mail.' : error.message)
        // O trigger do Auth cria o perfil; garante os campos (upsert cobre o caso de o trigger não existir).
        const { error: perr } = await adm.from('perfis').upsert({ id: novo.user.id, email, nome: nome || email, papel, empresa: eu.empresa })
        if (perr) { await adm.auth.admin.deleteUser(novo.user.id); throw perr }
        return json({ ok: true, id: novo.user.id })
      }

      case 'atualizar': {
        const a = await alvo()
        const mudar: Record<string, string> = {}
        if (typeof body.nome === 'string' && body.nome.trim()) mudar.nome = body.nome.trim()
        if (body.papel && body.papel !== a.papel) {
          if (!PAPEIS.includes(body.papel)) return json({ erro: 'Papel inválido.' }, 400)
          if (a.papel === 'gestor') await garanteOutroGestor()
          mudar.papel = body.papel
        }
        if (Object.keys(mudar).length) { const { error } = await adm.from('perfis').update(mudar).eq('id', id); if (error) throw error }
        const authMudar: Record<string, unknown> = {}
        if (body.senha) { if (String(body.senha).length < 8) return json({ erro: 'Senha com pelo menos 8 caracteres.' }, 400); authMudar.password = String(body.senha) }
        if (typeof body.bloqueado === 'boolean') {
          if (id === user.id) return json({ erro: 'Você não pode bloquear a si mesmo.' }, 400)
          if (body.bloqueado && a.papel === 'gestor') await garanteOutroGestor()
          authMudar.ban_duration = body.bloqueado ? BLOQUEIO : 'none'
          if (!body.bloqueado) {
            const { data: u } = await adm.auth.admin.getUserById(id)
            authMudar.app_metadata = { ...(u?.user?.app_metadata ?? {}), falhas_login: 0, bloqueio_auto_em: null }
          }
        }
        if (mudar.nome) authMudar.user_metadata = { nome: mudar.nome }
        if (ACESSOS.includes(body.acesso)) {
          if (id === user.id && body.acesso === 'oa') return json({ erro: 'Você não pode restringir o próprio acesso.' }, 400)
          const { data: u } = await adm.auth.admin.getUserById(id)
          authMudar.app_metadata = { ...(u?.user?.app_metadata ?? {}), ...((authMudar.app_metadata as object) ?? {}), acesso: body.acesso }
        }
        if (Object.keys(authMudar).length) { const { error } = await adm.auth.admin.updateUserById(id, authMudar); if (error) throw error }
        return json({ ok: true })
      }

      case 'excluir': {
        if (id === user.id) return json({ erro: 'Você não pode excluir a si mesmo.' }, 400)
        const a = await alvo()
        if (a.papel === 'gestor') await garanteOutroGestor()
        const [{ count: calls }, { count: agenda }] = await Promise.all([
          adm.from('calls').select('id', { count: 'exact', head: true }).eq('user_id', id),
          adm.from('agenda_hosts').select('id', { count: 'exact', head: true }).eq('user_id', id),
        ])
        if (calls || agenda) {
          return json({ erro: `Excluir apagaria ${calls ? `${calls} call(s) gravada(s)` : 'a agenda'} desse usuário. Use "Bloquear acesso": ele não entra mais e os dados ficam.`, temDados: true }, 409)
        }
        const { error } = await adm.auth.admin.deleteUser(id)
        if (error) throw error
        return json({ ok: true })
      }

      default:
        return json({ erro: `ação desconhecida: ${body.acao}` }, 400)
    }
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }, 400)
  }
})
