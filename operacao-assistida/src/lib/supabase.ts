import { createClient, type Session } from '@supabase/supabase-js'

// Mesmo projeto e mesma publishable key da Inteligência de Calls (pública por design, protegida por RLS).
export const SUPABASE_URL = 'https://lhncmqqnyxqkxfhiafaz.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_9zXFMPKbxrrDM8t5ecjY5Q_p4wCipFB'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/**
 * Sessão compartilhada com o index.html (mesma origem → mesmo localStorage do supabase-js).
 * Em desenvolvimento (porta diferente) não há sessão: liberamos com um usuário fictício.
 */
export async function obterSessao(): Promise<Session | null | 'dev'> {
  if (import.meta.env.DEV) return 'dev'
  const { data } = await supabase.auth.getSession()
  return data.session
}

/** Volta para a tela de login da Inteligência de Calls. */
export function irParaLogin() {
  window.location.replace('/')
}
