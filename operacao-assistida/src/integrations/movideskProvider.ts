import { supabase } from '@/lib/supabase'
import type { ConfigIntegracao, IntegrationProvider, NovoTicketExterno, PessoaExterna, ResultadoTeste, TicketExterno } from './types'

/**
 * Provider real do Movidesk.
 *
 * A API do Movidesk autentica com `token` na query string — por isso o browser NUNCA chama a API direto.
 * Todas as chamadas passam pela Edge Function `oa-movidesk` (supabase/functions/oa-movidesk/index.ts),
 * que guarda o token como secret do projeto (`supabase secrets set MOVIDESK_TOKEN=...`).
 *
 * Endpoints usados (documentados no README do módulo):
 *   GET  /persons?$filter=...            busca de pessoas/organizações
 *   GET  /tickets?$filter=clients/any(...) tickets de um cliente
 *   POST /tickets                        criação de ticket
 */
export class MovideskProvider implements IntegrationProvider {
  readonly id = 'movidesk' as const
  readonly nome = 'Movidesk'

  constructor(private readonly config: ConfigIntegracao) {}

  // TODO: integração — depende da Edge Function publicada e do secret MOVIDESK_TOKEN.
  private async chamar<T>(acao: string, params: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.functions.invoke('oa-movidesk', {
      body: { acao, urlBase: this.config.urlBase, mapeamento: this.config.mapeamento, ...params },
    })
    if (error) throw new Error(`Movidesk: ${error.message}`)
    if (data?.erro) throw new Error(`Movidesk: ${data.erro}`)
    return data as T
  }

  async testarConexao(): Promise<ResultadoTeste> {
    try {
      const r = await this.chamar<{ ok: boolean; mensagem: string }>('testar')
      return { ok: r.ok, mensagem: r.mensagem }
    } catch (e) {
      return { ok: false, mensagem: 'Não foi possível conectar ao Movidesk.', detalhes: e instanceof Error ? e.message : String(e) }
    }
  }

  buscarPessoas(termo: string) { return this.chamar<PessoaExterna[]>('buscarPessoas', { termo }) }
  listarTickets(clienteId: string) { return this.chamar<TicketExterno[]>('listarTickets', { clienteId }) }
  criarTicket(dados: NovoTicketExterno) { return this.chamar<TicketExterno>('criarTicket', { ...dados }) }
}
