// Edge Function: proxy seguro para a API do Movidesk (Operação Assistida).
// Deploy:  supabase functions deploy oa-movidesk
// Secret:  supabase secrets set MOVIDESK_TOKEN=<token do Movidesk>
//
// O token nunca sai do servidor. O browser envia { acao, urlBase, mapeamento, ...params }
// e recebe objetos já normalizados (PessoaExterna / TicketExterno — ver src/integrations/types.ts).
//
// Webhook (opcional): configure no Movidesk um webhook apontando para
//   https://<projeto>.supabase.co/functions/v1/oa-movidesk?webhook=1
// com evento "Ticket criado/atualizado". O corpo é gravado em oa_eventos com origem 'integracao'.

import { createClient } from 'npm:@supabase/supabase-js@2'

const TOKEN = Deno.env.get('MOVIDESK_TOKEN') ?? ''
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Lê um caminho tipo "emails[0].email" ou "customFieldValues[segmento]" dentro do objeto do Movidesk.
function ler(obj: unknown, caminho: string): string | undefined {
  const cf = caminho.match(/^customFieldValues\[(.+)\]$/)
  if (cf) {
    const lista = (obj as { customFieldValues?: { customFieldId: number; value?: string; items?: { customFieldItem: string }[] }[] })?.customFieldValues ?? []
    const alvo = lista.find((v) => String(v.customFieldId) === cf[1])
    return alvo?.value ?? alvo?.items?.[0]?.customFieldItem
  }
  return caminho.split('.').reduce<unknown>((acc, parte) => {
    if (acc == null) return undefined
    const m = parte.match(/^(\w+)\[(\d+)\]$/)
    if (m) return (acc as Record<string, unknown[]>)[m[1]]?.[Number(m[2])]
    return (acc as Record<string, unknown>)[parte]
  }, obj) as string | undefined
}

async function movidesk(urlBase: string, caminho: string, init?: RequestInit) {
  const sep = caminho.includes('?') ? '&' : '?'
  const r = await fetch(`${urlBase}${caminho}${sep}token=${encodeURIComponent(TOKEN)}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  if (!r.ok) throw new Error(`Movidesk respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)

  // ---------- Webhook do Movidesk ----------
  if (url.searchParams.get('webhook') === '1') {
    // TODO: integração — validar assinatura/segredo do webhook antes de gravar.
    const corpo = await req.json().catch(() => null)
    if (!corpo) return json({ erro: 'corpo inválido' }, 400)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const clienteId = String(corpo?.clients?.[0]?.id ?? corpo?.clientId ?? '')
    const { data: cards } = await sb.from('oa_cards').select('id').eq('cliente_id', clienteId)
    for (const c of cards ?? []) {
      await sb.from('oa_eventos').upsert({
        card_id: c.id, tipo: 'ticket', titulo: `Ticket #${corpo.id}: ${corpo.subject ?? ''}`,
        descricao: `Status: ${corpo.status ?? ''}`, data_hora: corpo.lastUpdate ?? new Date().toISOString(),
        autor_nome: 'Movidesk', origem: 'integracao', gerado_pelo_sistema: false,
        link_externo: corpo.url ?? null, meta: { ticketId: String(corpo.id), status: corpo.status },
        chave_externa: `movidesk:${corpo.id}`,
      }, { onConflict: 'chave_externa' })
    }
    return json({ ok: true })
  }

  // ---------- Chamadas da UI ----------
  if (!TOKEN) return json({ erro: 'MOVIDESK_TOKEN não configurado no servidor (supabase secrets set MOVIDESK_TOKEN=...)' })
  const body = await req.json().catch(() => ({}))
  const { acao, urlBase = 'https://api.movidesk.com/public/v1', mapeamento = {} } = body

  try {
    switch (acao) {
      case 'testar': {
        await movidesk(urlBase, '/persons?$top=1&$select=id')
        return json({ ok: true, mensagem: 'Conectado ao Movidesk.' })
      }
      case 'buscarPessoas': {
        const termo = String(body.termo ?? '').replace(/'/g, "''")
        const filtro = termo ? `&$filter=contains(businessName,'${termo}') or contains(cpfCnpj,'${termo}') or id eq '${termo}'` : ''
        const lista = await movidesk(urlBase, `/persons?$top=20&$select=id,businessName,profileType,cpfCnpj,emails,phones,organization${filtro}`)
        return json((lista as Record<string, unknown>[]).map((p) => ({
          id: String(p.id), nome: p.businessName, tipo: p.profileType === 2 ? 'organizacao' : 'pessoa',
          documento: p.cpfCnpj, email: ler(p, mapeamento.contatoEmail ?? 'emails[0].email'), telefone: ler(p, mapeamento.contatoTelefone ?? 'phones[0].number'),
          organizacao: (p.organization as { businessName?: string } | undefined)?.businessName,
          url: `${urlBase.replace('/public/v1', '')}/Person/Edit/${p.id}`,
        })))
      }
      case 'listarTickets': {
        const id = String(body.clienteId ?? '').replace(/'/g, "''")
        const lista = await movidesk(urlBase, `/tickets?$top=50&$orderby=createdDate desc&$select=id,subject,status,createdDate,lastUpdate,category,urgency,owner&$expand=owner&$filter=clients/any(c: c/id eq '${id}')`)
        return json((lista as Record<string, unknown>[]).map((t) => ({
          id: String(t.id), numero: String(t.id), assunto: t.subject, status: t.status, responsavel: (t.owner as { businessName?: string } | undefined)?.businessName,
          criadoEm: t.createdDate, atualizadoEm: t.lastUpdate, categoria: t.category, urgencia: t.urgency,
          url: `${urlBase.replace('/public/v1', '')}/Ticket/Edit/${t.id}`,
        })))
      }
      case 'criarTicket': {
        // TODO: integração — ajustar createdBy/owner conforme o agente padrão do cliente no Movidesk.
        const novo = await movidesk(urlBase, '/tickets', {
          method: 'POST',
          body: JSON.stringify({
            type: 2, subject: body.assunto, category: body.categoria, urgency: 'Média',
            status: 'Novo', clients: [{ id: body.clienteId }],
            actions: [{ type: 2, origin: 4, description: body.descricao ?? body.assunto }],
          }),
        })
        return json({ id: String(novo.id), numero: String(novo.id), assunto: novo.subject, status: novo.status, criadoEm: novo.createdDate, url: `${urlBase.replace('/public/v1', '')}/Ticket/Edit/${novo.id}` })
      }
      default:
        return json({ erro: `ação desconhecida: ${acao}` }, 400)
    }
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) })
  }
})
