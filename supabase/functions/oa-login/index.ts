// Edge Function: login da Inteligência de Calls com bloqueio automático após 3 senhas erradas seguidas.
// Deploy: supabase functions deploy oa-login
//
// O contador fica em auth.users.app_metadata.falhas_login (só a service role escreve ali; o usuário não consegue zerar).
// Acertou a senha → zera. 3ª falha → ban no Auth (mesmo "Bloquear" da aba 👥 Usuários), liberado só por um administrador.
// Administradores (papel gestor) NÃO são bloqueados automaticamente: se o único admin se trancasse, ninguém liberaria.
// Limite conhecido: quem chamar a API de Auth do Supabase direto (fora desta tela) não passa pelo contador.

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MAX_FALHAS = 3
const BLOQUEIO = '876000h'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  const senha = String(body.senha ?? '')
  if (!email || !senha) return json({ erro: 'Informe e-mail e senha.' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const adm = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })

  const { data: perfil } = await adm.from('perfis').select('id, papel').ilike('email', email).maybeSingle()
  const { data: login, error } = await anon.auth.signInWithPassword({ email, password: senha })

  if (!error && login.session) {
    if (perfil) {
      const { data: u } = await adm.auth.admin.getUserById(perfil.id)
      if (u?.user?.app_metadata?.falhas_login) {
        await adm.auth.admin.updateUserById(perfil.id, { app_metadata: { ...u.user.app_metadata, falhas_login: 0 } })
      }
    }
    return json({ access_token: login.session.access_token, refresh_token: login.session.refresh_token })
  }

  if (error && ((error as { code?: string }).code === 'user_banned' || /banned/i.test(error.message))) return json({ bloqueado: true })

  // Senha errada: conta a falha (só para usuário que existe).
  if (perfil) {
    const { data: u } = await adm.auth.admin.getUserById(perfil.id)
    const meta = u?.user?.app_metadata ?? {}
    const banido = !!u?.user && !!(u.user as { banned_until?: string }).banned_until && new Date((u.user as { banned_until?: string }).banned_until!) > new Date()
    if (banido) return json({ bloqueado: true })
    const falhas = Number(meta.falhas_login ?? 0) + 1
    if (falhas >= MAX_FALHAS && perfil.papel !== 'gestor') {
      await adm.auth.admin.updateUserById(perfil.id, {
        ban_duration: BLOQUEIO,
        app_metadata: { ...meta, falhas_login: 0, bloqueio_auto_em: new Date().toISOString() },
      })
      return json({ bloqueado: true, automatico: true })
    }
    await adm.auth.admin.updateUserById(perfil.id, { app_metadata: { ...meta, falhas_login: falhas } })
    if (perfil.papel !== 'gestor') return json({ erro: 'E-mail ou senha incorretos.', restantes: MAX_FALHAS - falhas })
  }
  return json({ erro: 'E-mail ou senha incorretos.' })
})
