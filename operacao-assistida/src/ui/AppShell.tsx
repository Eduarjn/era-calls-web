import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

/** Abas do menu principal da Inteligência de Calls. As demais levam de volta ao index.html. */
const ABAS = [
  { id: 'calls', rotulo: '📞 Calls' },
  { id: 'trend', rotulo: '📊 Tendências' },
  { id: 'mkt', rotulo: '📣 Marketing' },
  { id: 'rel', rotulo: '📈 Relatórios' },
  { id: 'base', rotulo: '📚 Base' },
  { id: 'usuarios', rotulo: '👥 Usuários' },
] as const

function lerTema(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const [tema, setTema] = useState<'light' | 'dark'>(lerTema)
  // Acesso "só Operação Assistida" (app_metadata.acesso = 'oa', definido na aba 👥 Usuários): sem os outros menus.
  const [soOA, setSoOA] = useState(false)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setSoOA(data.user?.app_metadata?.acesso === 'oa')) }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
    try { localStorage.setItem('tema', tema) } catch { /* preferência de UI; ignora */ }
  }, [tema])

  async function sair() {
    await supabase.auth.signOut()
    window.location.replace('/')
  }

  return (
    <>
      <div className="topbar" id="topbar" />
      <header className="relative [@media(min-height:560px)]:sticky top-0 z-10 flex items-center gap-2.5 sm:gap-3.5 px-3 sm:px-6 py-2.5 sm:py-3.5 bg-head border-b border-line border-t-[3px] border-t-accent">
        <a href={soOA ? '/operacao-assistida/' : '/'} className="grid place-items-center w-[42px] h-[42px] rounded-ctl bg-accent2 text-white text-xl" title="Voltar para a Inteligência de Calls">🎧</a>
        <div className="min-w-0">
          <h1 className="text-[15px] sm:text-[17px] uppercase tracking-[.06em] font-bold truncate">Inteligência de Calls</h1>
          <div className="text-[11px] font-mono text-muted truncate">{email}</div>
        </div>
        <div className="flex-1" />
        <button className="btn btn-soft" onClick={() => setTema(tema === 'dark' ? 'light' : 'dark')} title="Alternar modo claro/escuro">
          {tema === 'dark' ? '☀️' : '🌙'}
        </button>
        <button className="btn btn-soft" onClick={sair}>Sair</button>
      </header>

      <main className="px-3 sm:px-6 py-4 sm:py-6 max-w-[1680px] mx-auto">
        <nav className="viewnav !flex-nowrap overflow-x-auto" aria-label="Menu principal">
          {!soOA && ABAS.map((a) => (
            <a key={a.id} className="vtab shrink-0 whitespace-nowrap" href={`/#${a.id}`}>{a.rotulo}</a>
          ))}
          <a className="vtab active shrink-0 whitespace-nowrap" href="/operacao-assistida/" aria-current="page">🛠️ Operação Assistida</a>
        </nav>
        <div className="viewfade">{children}</div>
      </main>
    </>
  )
}
