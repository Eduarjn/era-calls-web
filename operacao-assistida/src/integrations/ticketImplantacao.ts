import { supabase } from '@/lib/supabase'
import { modoRepository } from '@/data'
import type { Card } from '@/domain/types'
import { ticketDoNome, type DadosTicket } from '../../../supabase/functions/oa-movidesk/ticket'

/**
 * Dados do ticket de implantação do Movidesk mostrados no card (só leitura).
 * O ticket vem do número no início ou no fim do nome do card ("114254 - NEVES TEC ...", "... LTDA - 112989") ou do campo digitado.
 * A leitura acontece na Edge Function `oa-movidesk` (ação `dadosTicket`): o token e o texto do ticket ficam no servidor.
 * Guardado em `camposCustomizados._movidesk` (JSON) — sem coluna nova no banco.
 */
export type { DadosTicket, AgendaTicket } from '../../../supabase/functions/oa-movidesk/ticket'
export { ticketDoNome }

export const CHAVE_MOVIDESK = '_movidesk'
export const CHAVE_TICKET = '_movidesk_ticket'

export function dadosTicketDoCard(card: Card): DadosTicket | undefined {
  const v = card.camposCustomizados?.[CHAVE_MOVIDESK]
  if (typeof v !== 'string' || !v) return undefined
  try { return JSON.parse(v) as DadosTicket } catch { return undefined }
}

/** Ticket do card: o já lido, o digitado no card ou o número no início do nome. */
export function ticketDoCard(card: Card): string | undefined {
  const digitado = card.camposCustomizados?.[CHAVE_TICKET]
  return dadosTicketDoCard(card)?.ticket ?? (typeof digitado === 'string' && digitado ? digitado : undefined) ?? ticketDoNome(card.clienteNome)
}

/** Busca no Movidesk (via Edge Function). Em modo de exemplo devolve dados fictícios para testar a tela. */
export async function buscarDadosTicket(ticket: string, nomeCard = ''): Promise<DadosTicket> {
  if (modoRepository() === 'mock') {
    await new Promise((r) => setTimeout(r, 400))
    const empresa = nomeCard.replace(/^\s*#?\d{5,7}\s*[-–|]?\s*/, '').replace(/\s*[-–|#]\s*\d{5,7}\s*$/, '').trim() || 'EMPRESA DE EXEMPLO LTDA'
    return {
      ticket, assunto: `1538 | NOVA ATIVAÇÃO | ${empresa} | VENDEDOR`, status: 'Em atendimento',
      criadoEm: new Date(Date.now() - 6 * 86400_000).toISOString(), empresa, cnpj: '10.972.996/0001-50',
      contatoNome: 'Everton (exemplo)', telefone: '21 96482-5281',
      reuniaoEscopo: { quando: new Date(Date.now() - 4 * 86400_000).toISOString().slice(0, 10) + 'T15:00', origem: 'agenda' },
      treinamento: { quando: new Date(Date.now() - 1 * 86400_000).toISOString().slice(0, 10), origem: 'mencao' },
      dominio: 'exemplo.eracloud.com.br',
      ticketOA: { numero: String(Number(ticket) + 812), assunto: `Op. Assistida - ${empresa}`, status: 'Iniciado', url: `https://calliope.movidesk.com/Ticket/Edit/${Number(ticket) + 812}` },
      url: `https://calliope.movidesk.com/Ticket/Edit/${ticket}`, lidoEm: new Date().toISOString(),
    }
  }
  const { data, error } = await supabase.functions.invoke('oa-movidesk', { body: { acao: 'dadosTicket', ticket } })
  if (error) {
    // Erro HTTP da função: a mensagem útil vem no corpo ({ erro }).
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(corpo?.erro ?? error.message)
  }
  if (data?.erro) throw new Error(data.erro)
  return data as DadosTicket
}

export type TipoAcaoTicket = 'publica' | 'interna'

/** Inclui uma ação no ticket do Movidesk (pública = vai por e-mail aos clientes e cópias do ticket). */
export async function publicarNoTicket(ticket: string, texto: string, tipo: TipoAcaoTicket, encaminharFinanceiro = false):
  Promise<{ autor: string | null; encaminhadoPara?: string | null; avisoEncaminhar?: string }> {
  if (modoRepository() === 'mock') {
    await new Promise((r) => setTimeout(r, 500))
    return { autor: 'Você (modo de exemplo — nada foi enviado)', encaminhadoPara: encaminharFinanceiro ? 'Natali Silva (exemplo)' : null }
  }
  const { data, error } = await supabase.functions.invoke('oa-movidesk', { body: { acao: 'publicarAcao', ticket, texto, tipo, encaminharFinanceiro } })
  if (error) {
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(corpo?.erro ?? error.message)
  }
  if (data?.erro) throw new Error(data.erro)
  return { autor: data?.autor ?? null, encaminhadoPara: data?.encaminhadoPara ?? null, avisoEncaminhar: data?.avisoEncaminhar }
}

/** Modelos de mensagem para o ticket. */
export const MODELOS_MENSAGEM: { id: string; nome: string; texto: (v: { contato?: string; empresa?: string; autor?: string }) => string }[] = [
  {
    id: 'encerramento',
    nome: 'Encerramento da operação assistida',
    texto: ({ contato, empresa, autor }) => [
      `Olá${contato ? `, ${contato}` : ''}!`,
      '',
      `Chegamos ao fim da etapa de Operação Assistida${empresa ? ` da ${empresa}` : ''}. Muito obrigado por confiar na ERA e pela parceria durante toda a implantação.`,
      '',
      'A partir de agora, as tratativas passam a ser feitas diretamente com o nosso time de Suporte, pelos canais abaixo:',
      '',
      '📞 Urgências e emergências: (19) 3199-0500',
      '💬 WhatsApp: (19) 3199-0500',
      '🎫 Solicitações de alterações, configurações e demais demandas: abertura de ticket pelo Movidesk',
      '',
      'Seguimos à disposição para apoiar vocês no dia a dia.',
      '',
      'Atenciosamente,',
      ...(autor ? [autor] : []),
      'ERA — Atenda mais e melhor por voz, mensagem e IA.',
      'Acesse: era.com.br',
    ].join('\n'),
  },
  { id: 'livre', nome: 'Mensagem em branco', texto: () => '' },
]
