import { useEffect, useState } from 'react'
import { obterSessao, irParaLogin } from '@/lib/supabase'
import { inicializarRepository } from '@/data'
import { AppShell } from '@/ui/AppShell'
import { BoardHome } from '@/features/board/BoardHome'
import { ToastHost } from '@/ui/Toast'

type Auth = { estado: 'carregando' } | { estado: 'ok'; email: string; modo: 'mock' | 'supabase' }

export default function App() {
  const [auth, setAuth] = useState<Auth>({ estado: 'carregando' })

  useEffect(() => {
    obterSessao().then(async (s) => {
      if (!s) return irParaLogin()
      const modo = await inicializarRepository()
      setAuth({ estado: 'ok', email: s === 'dev' ? 'dev@local' : (s.user.email ?? ''), modo })
    })
  }, [])

  if (auth.estado === 'carregando') {
    return <div className="topbar" style={{ width: '40%', opacity: 1 }} aria-label="Carregando" />
  }

  return (
    <AppShell email={auth.email}>
      {auth.modo === 'mock' && (
        <div className="mb-4 rounded-box border border-amber/40 bg-amber/8 px-3.5 py-2.5 text-[13px] flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] uppercase tracking-[.08em] text-amber font-semibold">Dados de exemplo</span>
          <span className="text-ink">Este quadro está em memória e volta ao início a cada recarga. Para gravar de verdade, rode <code className="font-mono text-[12px]">supabase/oa_schema.sql</code> no SQL Editor do projeto — o módulo passa a usar o banco sozinho.</span>
        </div>
      )}
      <BoardHome />
      <ToastHost />
    </AppShell>
  )
}
