import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import type { Board } from '@/domain/types'
import { SUPABASE_URL } from '@/lib/supabase'
import { getProvider, MAPEAMENTO_PADRAO_MOVIDESK, type CampoCardMapeavel, type ConfigIntegracao as Config, type ResultadoTeste } from '@/integrations'
import { useConfigIntegracao, useSalvarConfigIntegracao } from './useIntegracao'

interface Props { board: Board; onFechar: () => void; onSincronizar: () => void; sincronizando: boolean }

const CAMPOS: { id: CampoCardMapeavel; rotulo: string }[] = [
  { id: 'clienteNome', rotulo: 'Nome do cliente' }, { id: 'clienteId', rotulo: 'Id externo' }, { id: 'contatoNome', rotulo: 'Contato principal' },
  { id: 'contatoEmail', rotulo: 'E-mail do contato' }, { id: 'contatoTelefone', rotulo: 'Telefone do contato' }, { id: 'segmento', rotulo: 'Segmento' }, { id: 'produtoPlano', rotulo: 'Produto / plano' },
]

/** Configurações da integração: provider, URL, credencial (só no servidor), mapeamento, teste, sincronização. */
export function ConfigIntegracaoTela({ board, onFechar, onSincronizar, sincronizando }: Props) {
  const config = useConfigIntegracao(board.id)
  const salvar = useSalvarConfigIntegracao(board.id)
  const [rascunho, setRascunho] = useState<Config | null>(null)
  const [teste, setTeste] = useState<ResultadoTeste | null>(null)
  const [testando, setTestando] = useState(false)

  useEffect(() => { if (config.data && !rascunho) setRascunho(config.data) }, [config.data, rascunho])
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onFechar(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onFechar])

  if (!rascunho) return null
  const r = rascunho
  const set = (p: Partial<Config>) => setRascunho({ ...r, ...p })
  const sujo = JSON.stringify(r) !== JSON.stringify(config.data)
  const webhookUrl = `${SUPABASE_URL}/functions/v1/oa-movidesk?webhook=1`

  async function testar() {
    setTestando(true); setTeste(null)
    try { setTeste(await getProvider(r).testarConexao()) } finally { setTestando(false) }
  }

  return (
    <div className="fixed inset-0 z-40 bg-navy/30 backdrop-blur-[1px] grid place-items-center p-4" onClick={onFechar}>
      <div className="w-full max-w-[760px] max-h-[92vh] bg-modal border border-line rounded-box shadow-lift flex flex-col" style={{ borderTop: '3px solid var(--accent)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Configurar integração">
        <div className="px-5 py-4 border-b border-line flex items-center gap-2"><h3 className="text-[19px]">Integração · {board.nome}</h3><span className="flex-1" /><button className="btn btn-soft btn-sm" onClick={onFechar}>Esc ✕</button></div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className="lbl block mb-1.5">Sistema</span>
              <select value={r.provider} onChange={(e) => set({ provider: e.target.value as Config['provider'] })}><option value="mock">Exemplo (mock) — funciona hoje</option><option value="movidesk">Movidesk (real)</option></select></label>
            <label className="flex items-center gap-2 text-[13.5px] mt-6 cursor-pointer"><input type="checkbox" className="!w-auto" checked={r.ativa} onChange={(e) => set({ ativa: e.target.checked })} />Integração ativa neste quadro</label>
            <label className="block col-span-2"><span className="lbl block mb-1.5">URL base da API</span><input value={r.urlBase} onChange={(e) => set({ urlBase: e.target.value })} placeholder="https://api.movidesk.com/public/v1" disabled={r.provider === 'mock'} /></label>
          </div>

          <div className="rounded-box border border-line bg-soft3 p-3.5 text-[13px]">
            <div className="lbl mb-1.5">Credencial (token)</div>
            {r.provider === 'mock' ? (
              <p className="text-muted">O provider de exemplo não precisa de credencial.</p>
            ) : (
              <>
                <p>O token do Movidesk fica <b>só no servidor</b>, como secret da Edge Function — nunca neste navegador nem no código.</p>
                <pre className="mt-2 bg-card border border-line rounded-ctl p-2.5 font-mono text-[12px] overflow-x-auto">supabase secrets set MOVIDESK_TOKEN=&lt;token&gt;{'\n'}supabase functions deploy oa-movidesk</pre>
                <p className="text-muted mt-2">Use "Testar conexão" para confirmar que o servidor já tem o token.</p>
              </>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2"><span className="lbl">Mapeamento de campos</span><span className="flex-1" /><button className="btn btn-soft btn-sm" onClick={() => set({ mapeamento: { ...MAPEAMENTO_PADRAO_MOVIDESK } })}>Padrão Movidesk</button></div>
            <div className="border border-line rounded-box overflow-hidden">
              {CAMPOS.map((c) => (
                <div key={c.id} className="grid grid-cols-[200px_1fr] gap-2 items-center px-3 py-1.5 border-b border-line last:border-b-0 text-[13px]">
                  <span className="text-navy">{c.rotulo}</span>
                  <input className="!py-1 !text-[12.5px] font-mono" value={r.mapeamento[c.id] ?? ''} onChange={(e) => set({ mapeamento: { ...r.mapeamento, [c.id]: e.target.value } })} placeholder="campo no sistema externo" />
                </div>
              ))}
            </div>
            <p className="text-[12px] text-muted mt-1.5">Caminhos como <code>emails[0].email</code> ou <code>customFieldValues[123]</code> são lidos pela Edge Function.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className="lbl block mb-1.5">Sincronização agendada</span>
              <select value={r.agendamentoMin} onChange={(e) => set({ agendamentoMin: Number(e.target.value) })}><option value={0}>Desligada (só manual / webhook)</option><option value={15}>A cada 15 min</option><option value={30}>A cada 30 min</option><option value={60}>A cada hora</option><option value={240}>A cada 4 horas</option></select></label>
            <div className="block"><span className="lbl block mb-1.5">Webhook (Movidesk → aqui)</span><input readOnly value={webhookUrl} className="font-mono !text-[11.5px]" onFocus={(e) => e.target.select()} /></div>
          </div>

          <div className="rounded-box border border-line p-3.5 text-[13px] flex items-center gap-3 flex-wrap">
            <div className="flex-1">
              <div className="font-semibold text-navy">Última sincronização: {config.data?.ultimaSync ? format(new Date(config.data.ultimaSync), 'dd/MM HH:mm') : 'nunca'}</div>
              {config.data?.ultimoErro ? <div className="text-red mt-0.5">⚠ {config.data.ultimoErro}</div> : <div className="text-muted mt-0.5">Importa tickets dos clientes vinculados como acionamentos, sem duplicar.</div>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onSincronizar} disabled={sincronizando || !config.data?.ativa}>{sincronizando ? '…' : '⇅'} Sincronizar agora</button>
          </div>

          {teste && <div className={`rounded-ctl border p-2.5 text-[13px] ${teste.ok ? 'border-green/40 bg-green/8 text-green' : 'border-red/40 bg-red/8 text-red'}`}>{teste.ok ? '✓' : '✕'} {teste.mensagem}{teste.detalhes && <div className="font-mono text-[11.5px] mt-1 opacity-80">{teste.detalhes}</div>}</div>}
        </div>

        <div className="px-5 py-3 border-t border-line flex items-center gap-2">
          <button className="btn btn-soft" onClick={testar} disabled={testando}>{testando ? 'Testando…' : 'Testar conexão'}</button>
          <span className="flex-1" />
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" disabled={!sujo || salvar.isPending} onClick={() => salvar.mutate(r, { onSuccess: onFechar })}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
