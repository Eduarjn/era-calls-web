import { describe, expect, it } from 'vitest'
import { extrairDadosTicket, ticketDoNome, type TicketMovidesk } from '../../../supabase/functions/oa-movidesk/ticket'

// Ticket fictício no formato real do Onboarding (formulário do vendedor + agendas coladas + checklist final).
const ticket: TicketMovidesk = {
  id: 199001,
  subject: '1234 | NOVA ATIVAÇÃO | EMPRESA FICTICIA LTDA | VENDEDORA - ERA',
  status: 'Em atendimento',
  createdDate: '2026-09-18T18:53:14.39',
  actions: [
    { id: 1, createdDate: '2026-09-18T18:57:16', description: 'Boa tarde pessoal!<br>Data de assinatura do contrato: 18/09/2026<br>Nome da empresa: EMPRESA FICTICIA LTDA<br>CNPJ: 12345678000199<br>Nome do responsável: Fulano<br>Contato: (11) 98888-7777<br>E-mail: fulano@exemplo.com' },
    { id: 2, createdDate: '2026-09-19T12:00:00', description: '<p>Reunião de Boas Vindas/Escopo - 199001 - EMPRESA FICTICIA LTDA</p><p>Terça-feira, 22 de setembro · 3:00 – 4:00pm</p>' },
    { id: 3, createdDate: '2026-09-20T12:00:00', description: '<p>Reunião de Boas Vindas/Escopo - 199001 - EMPRESA FICTICIA LTDA</p><p>Quarta-feira, 23 de setembro · 11:00am – 12:00pm</p>' },
    { id: 4, createdDate: '2026-09-24T15:10:00', description: 'DNS - x.eracloud.com.br<br>SENHA: Segredo@123<br>Treinamento PABX - Ofereci a data de quinta 24/09 às 14h<br>Treinamento PABX - Agendado 25/09 - 10h30' },
  ],
}

describe('leitura do ticket de implantação', () => {
  const d = extrairDadosTicket(ticket, 'https://calliope.movidesk.com', new Date('2026-09-24T12:00:00Z'))

  it('formulário do vendedor: empresa, CNPJ formatado, responsável e telefone', () => {
    expect(d.empresa).toBe('EMPRESA FICTICIA LTDA')
    expect(d.cnpj).toBe('12.345.678/0001-99')
    expect(d.contatoNome).toBe('Fulano')
    expect(d.telefone).toBe('(11) 98888-7777')
    expect(d.criadoEm).toBe('2026-09-18T18:53:14.390Z') // Movidesk devolve UTC sem "Z"
  })

  it('ticket de Operação Assistida = filho "Op. Assistida - ..." (ignora outros filhos e apagados)', () => {
    const t = extrairDadosTicket({ ...ticket, childrenTickets: [
      { id: 199100, subject: 'ADITIVO | EMPRESA' }, { id: 199200, subject: 'Op. Assistida - X', isDeleted: true },
      { id: 199150, subject: 'Op. Assistida - MIGRAÇÃO | EMPRESA FICTICIA LTDA' }] })
    expect(t.ticketOA).toEqual({ numero: '199150', assunto: 'Op. Assistida - MIGRAÇÃO | EMPRESA FICTICIA LTDA', url: 'https://calliope.movidesk.com/Ticket/Edit/199150' })
    expect(d.ticketOA).toBeUndefined()
  })

  it('domínio de acesso da plataforma vem do checklist (DNS - x.eracloud.com.br)', () => {
    expect(d.dominio).toBe('x.eracloud.com.br')
  })

  it('reunião de escopo: vale a última agenda (remarcação) e "11:00am – 12:00pm" começa às 11h', () => {
    expect(d.reuniaoEscopo).toEqual({ quando: '2026-09-23T11:00', origem: 'agenda' })
  })

  it('treinamento sem agenda: usa a linha do checklist e ignora a data só oferecida', () => {
    expect(d.treinamento).toEqual({ quando: '2026-09-25T10:30', origem: 'mencao' })
  })

  it('nunca devolve o texto das ações (tem senha)', () => {
    expect(JSON.stringify(d)).not.toMatch(/Segredo|SENHA|DNS -/) // o domínio sai de propósito; a senha nunca
  })

  it('"3:00 – 4:00pm" vira 15:00 e o assunto dá a empresa quando falta o formulário', () => {
    const t = extrairDadosTicket({ ...ticket, actions: [ticket.actions![1]!] })
    expect(t.reuniaoEscopo?.quando).toBe('2026-09-22T15:00')
    expect(t.empresa).toBe('EMPRESA FICTICIA LTDA')
    expect(t.cnpj).toBeUndefined()
  })

  it('agenda de janeiro enviada em dezembro cai no ano seguinte', () => {
    const t = extrairDadosTicket({ id: 1, subject: 'x', actions: [
      { id: 1, createdDate: '2026-12-20T12:00:00', description: 'Treinamento OMNI - 1 - X<br>Segunda-feira, 4 de janeiro · 2:00 – 3:00pm' },
    ] })
    expect(t.treinamento?.quando).toBe('2027-01-04T14:00')
  })

  it('número do ticket no nome do card', () => {
    expect(ticketDoNome('114254 - NEVES TEC REFRIGERACAO LTDA')).toBe('114254')
    expect(ticketDoNome('#114254 NEVES')).toBe('114254')
    expect(ticketDoNome('ESCOLA CRECHE OLIVEIRA LTDA - 112989')).toBe('112989')
    expect(ticketDoNome('LOJA 2000 LTDA')).toBeUndefined()
    expect(ticketDoNome('1538 - curto demais')).toBeUndefined()
  })
})
