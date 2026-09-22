import type { IntegrationProvider, NovoTicketExterno, PessoaExterna, ResultadoTeste, TicketExterno } from './types'

const dormir = (ms = 250) => new Promise((r) => setTimeout(r, ms))

const PESSOAS: PessoaExterna[] = [
  { id: 'org-1001', nome: 'Clínica Vida Plena', tipo: 'organizacao', documento: '12.345.678/0001-90', email: 'contato@vidaplena.com.br', telefone: '(11) 3333-1000', url: '#' },
  { id: 'org-1002', nome: 'Provedor NetSul', tipo: 'organizacao', documento: '98.765.432/0001-10', email: 'suporte@netsul.net.br', telefone: '(51) 4000-2000', url: '#' },
  { id: 'org-1003', nome: 'Escola Horizonte', tipo: 'organizacao', documento: '11.222.333/0001-44', email: 'secretaria@horizonte.edu.br', url: '#' },
  { id: 'org-1004', nome: 'Log Express Transportes', tipo: 'organizacao', documento: '55.666.777/0001-88', email: 'ti@logexpress.com.br', url: '#' },
  { id: 'pes-2001', nome: 'Mariana Costa', tipo: 'pessoa', email: 'mariana@vidaplena.com.br', telefone: '(11) 98888-1111', organizacao: 'Clínica Vida Plena', url: '#' },
  { id: 'pes-2002', nome: 'Carlos Menezes', tipo: 'pessoa', email: 'carlos@netsul.net.br', organizacao: 'Provedor NetSul', url: '#' },
]

const TICKETS: Record<string, TicketExterno[]> = {
  'org-1001': [
    { id: 't-501', numero: '501', assunto: 'Ramal 2003 não registra', status: 'Resolvido', responsavel: 'Suporte N1', criadoEm: '2026-09-06T13:10:00Z', url: '#', categoria: 'Suporte' },
    { id: 't-517', numero: '517', assunto: 'Dúvida sobre gravação de chamadas', status: 'Em atendimento', responsavel: 'Ana Souza', criadoEm: '2026-09-09T09:40:00Z', url: '#', categoria: 'Dúvida' },
  ],
  'org-1002': [
    { id: 't-488', numero: '488', assunto: 'Configurar bina por rota', status: 'Novo', responsavel: 'Rafael Lima', criadoEm: '2026-09-08T16:00:00Z', url: '#', categoria: 'Configuração' },
  ],
  'org-1003': [
    { id: 't-470', numero: '470', assunto: 'Treinamento adicional da recepção', status: 'Aguardando cliente', criadoEm: '2026-09-01T11:00:00Z', url: '#' },
  ],
}

/** Provider de exemplo: funciona hoje, sem credencial. */
export class MockProvider implements IntegrationProvider {
  readonly id = 'mock' as const
  readonly nome = 'Exemplo (mock)'
  private seq = 900

  async testarConexao(): Promise<ResultadoTeste> { await dormir(); return { ok: true, mensagem: 'Conexão de exemplo OK (dados fictícios).' } }

  async buscarPessoas(termo: string) {
    await dormir()
    const t = termo.trim().toLowerCase()
    if (!t) return PESSOAS.slice(0, 5)
    return PESSOAS.filter((p) => [p.nome, p.documento, p.email, p.id, p.organizacao].filter(Boolean).join(' ').toLowerCase().includes(t))
  }

  async listarTickets(clienteId: string) { await dormir(); return [...(TICKETS[clienteId] ?? [])] }

  async criarTicket(dados: NovoTicketExterno) {
    await dormir()
    const t: TicketExterno = { id: `t-${++this.seq}`, numero: String(this.seq), assunto: dados.assunto, status: 'Novo', criadoEm: new Date().toISOString(), url: '#', categoria: dados.categoria }
    ;(TICKETS[dados.clienteId] ??= []).unshift(t)
    return t
  }
}
