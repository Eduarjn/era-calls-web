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
import { extrairDadosTicket, type TicketMovidesk } from './ticket.ts'

const TOKEN = Deno.env.get('MOVIDESK_TOKEN') ?? ''
// Quem recebe o ticket de Operação Assistida quando ela é encerrada (pode trocar por secret sem mexer no código).
const FINANCEIRO_RESPONSAVEL = Deno.env.get('OA_FINANCEIRO_RESPONSAVEL') ?? 'Natali Silva'
const FINANCEIRO_EQUIPE = Deno.env.get('OA_FINANCEIRO_EQUIPE') ?? 'Financeiro'
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
  const texto = await r.text()
  if (!r.ok) throw new Error(`Movidesk respondeu ${r.status}: ${texto.slice(0, 300)}`)
  return texto ? JSON.parse(texto) : null // PATCH devolve corpo vazio
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
  // Só usuário logado da Inteligência de Calls (com perfil na tabela perfis) usa o proxy.
  const auth = req.headers.get('Authorization') ?? ''
  const sbUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await sbUsuario.auth.getUser()
  if (!user) return json({ erro: 'Faça login na Inteligência de Calls.' }, 401)
  const { data: perfil } = await sbUsuario.from('perfis').select('id').eq('id', user.id).maybeSingle()
  if (!perfil) return json({ erro: 'Usuário sem perfil na plataforma.' }, 403)

  if (!TOKEN) return json({ erro: 'MOVIDESK_TOKEN não configurado no servidor (supabase secrets set MOVIDESK_TOKEN=...)' })
  const body = await req.json().catch(() => ({}))
  const { acao, urlBase = 'https://api.movidesk.com/public/v1', mapeamento = {} } = body

  try {
    switch (acao) {
      case 'dadosTicket': {
        // Ticket de implantação → só os campos do card (o texto das ações tem senhas e nunca sai daqui).
        const numero = String(body.ticket ?? '').replace(/\D/g, '')
        if (!numero) return json({ erro: 'Informe o número do ticket.' }, 400)
        let t: TicketMovidesk | null = null
        for (const rota of ['/tickets', '/tickets/past']) { // /tickets só vê atualizados nos últimos 90 dias
          try { t = await movidesk(urlBase, `${rota}?id=${numero}`); if (t?.id) break } catch (e) {
            if (!String(e).includes(' 404')) throw e
          }
        }
        if (!t?.id) return json({ erro: `Ticket ${numero} não encontrado no Movidesk.` }, 404)
        const dados = extrairDadosTicket(t, urlBase.replace('api.movidesk.com/public/v1', 'calliope.movidesk.com'))
        if (dados.ticketOA && dados.ticketOA.numero !== dados.ticket) {
          try { // status do ticket de OA (só o status; o texto não sai daqui)
            const oa = await movidesk(urlBase, `/tickets?id=${dados.ticketOA.numero}&$select=id,status`)
            dados.ticketOA.status = oa?.status ?? undefined
          } catch { /* status é opcional */ }
        } else if (dados.ticketOA) dados.ticketOA.status = dados.status
        return json(dados)
      }
      case 'publicarAcao': {
        // Nova ação no ticket (PATCH só com a ação nova, sem id = inserir; as ações existentes não mudam).
        const numero = String(body.ticket ?? '').replace(/\D/g, '')
        const texto = String(body.texto ?? '').trim()
        const tipo = body.tipo === 'interna' ? 1 : 2 // 1 = interna, 2 = pública (vai por e-mail a clientes e cópias)
        if (!numero || !texto) return json({ erro: 'Informe o ticket e o texto.' }, 400)
        if (texto.length > 8000) return json({ erro: 'Mensagem longa demais (máx. 8.000 caracteres).' }, 400)
        // Autor = agente do Movidesk com o mesmo e-mail do login (senão o Movidesk usa o dono do token).
        let autor: { id: string; businessName?: string } | undefined
        if (user.email) {
          const email = user.email.replace(/'/g, "''")
          const pessoas = await movidesk(urlBase, `/persons?$top=5&$select=id,businessName,profileType,isActive&$filter=emails/any(e: e/email eq '${email}')`)
          autor = (pessoas as { id: string; businessName?: string; profileType?: number; isActive?: boolean }[])
            .find((p) => p.isActive !== false && (p.profileType === 1 || p.profileType === 3))
        }
        const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const html = texto.split(/\r?\n/).map((l) => esc(l) || '&nbsp;').join('<br>')
        await movidesk(urlBase, `/tickets?id=${numero}`, {
          method: 'PATCH',
          body: JSON.stringify({ actions: [{ type: tipo, description: html, ...(autor ? { createdBy: { id: autor.id } } : {}) }] }),
        })
        // Encerramento: passa o ticket para o Financeiro (responsável + equipe). Depois da ação, para ela nunca se perder.
        let encaminhadoPara: string | null = null
        if (body.encaminharFinanceiro) {
          try {
            const nome = FINANCEIRO_RESPONSAVEL.replace(/'/g, "''")
            const agentes = await movidesk(urlBase, `/persons?$top=5&$select=id,businessName,profileType,isActive&$filter=businessName eq '${nome}'`) as { id: string; businessName?: string; profileType?: number; isActive?: boolean }[]
            const dono = agentes.find((p) => p.isActive !== false && (p.profileType === 1 || p.profileType === 3))
            if (!dono) throw new Error(`agente "${FINANCEIRO_RESPONSAVEL}" não encontrado no Movidesk`)
            await movidesk(urlBase, `/tickets?id=${numero}`, { method: 'PATCH', body: JSON.stringify({ owner: { id: dono.id }, ownerTeam: FINANCEIRO_EQUIPE }) })
            encaminhadoPara = dono.businessName ?? FINANCEIRO_RESPONSAVEL
          } catch (e) {
            return json({ ok: true, autor: autor?.businessName ?? null, avisoEncaminhar: `Mensagem publicada, mas não deu para passar ao Financeiro: ${e instanceof Error ? e.message : e}` })
          }
        }
        return json({ ok: true, autor: autor?.businessName ?? null, encaminhadoPara })
      }
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
