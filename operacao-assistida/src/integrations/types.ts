/**
 * Camada de integração desacoplada. A UI só fala com `IntegrationProvider`.
 * Implementações: MockProvider (dados de exemplo) e MovideskProvider (real, via Edge Function).
 */

export type ProviderId = 'mock' | 'movidesk'

export interface PessoaExterna {
  id: string
  nome: string
  tipo: 'pessoa' | 'organizacao'
  documento?: string      // CNPJ/CPF
  email?: string
  telefone?: string
  organizacao?: string    // nome da empresa, quando é pessoa
  url?: string
}

export interface TicketExterno {
  id: string
  numero: string
  assunto: string
  status: string
  responsavel?: string
  criadoEm: string        // ISO
  atualizadoEm?: string
  url: string
  categoria?: string
  urgencia?: string
}

export interface NovoTicketExterno {
  clienteId: string
  assunto: string
  descricao?: string
  categoria?: string
}

export interface ResultadoTeste { ok: boolean; mensagem: string; detalhes?: string }

export interface IntegrationProvider {
  readonly id: ProviderId
  readonly nome: string
  testarConexao(): Promise<ResultadoTeste>
  buscarPessoas(termo: string): Promise<PessoaExterna[]>
  listarTickets(clienteId: string): Promise<TicketExterno[]>
  criarTicket(dados: NovoTicketExterno): Promise<TicketExterno>
}

/** Campos do card que podem ser preenchidos a partir da integração. */
export type CampoCardMapeavel = 'clienteNome' | 'clienteId' | 'contatoNome' | 'contatoEmail' | 'contatoTelefone' | 'segmento' | 'produtoPlano'

export interface ConfigIntegracao {
  boardId: string
  provider: ProviderId
  ativa: boolean
  /** Ex.: https://api.movidesk.com/public/v1 */
  urlBase: string
  /** Campo do card → campo do provider (ex.: contatoEmail → emails[0].email). */
  mapeamento: Partial<Record<CampoCardMapeavel, string>>
  /** Sincronização agendada em minutos (0 = desligada). */
  agendamentoMin: number
  ultimaSync?: string
  ultimoErro?: string
}

export const MAPEAMENTO_PADRAO_MOVIDESK: Required<ConfigIntegracao['mapeamento']> = {
  clienteNome: 'businessName',
  clienteId: 'id',
  contatoNome: 'contacts[0].businessName',
  contatoEmail: 'emails[0].email',
  contatoTelefone: 'phones[0].number',
  segmento: 'customFieldValues[segmento]',
  produtoPlano: 'customFieldValues[plano]',
}

export const CONFIG_INTEGRACAO_PADRAO = (boardId: string): ConfigIntegracao => ({
  boardId, provider: 'mock', ativa: true, urlBase: 'https://api.movidesk.com/public/v1',
  mapeamento: { ...MAPEAMENTO_PADRAO_MOVIDESK }, agendamentoMin: 0,
})
