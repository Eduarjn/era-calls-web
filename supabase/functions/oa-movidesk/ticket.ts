/**
 * Leitura do ticket de implantação do Movidesk → dados que aparecem no card da Operação Assistida.
 * TypeScript puro (sem Deno/Node): roda na Edge Function e nos testes do app (vitest).
 *
 * De onde vem cada dado (levantado em 80 tickets da equipe Onboarding, set/2026):
 * - Formulário do vendedor na 1ª ação ("Nome da empresa:", "CNPJ:", "Nome do responsável:", "Contato:"),
 *   presente em todas as implantações reais. O `clients` do ticket é o VENDEDOR, não o cliente.
 * - Agendas coladas pelo Onboarding: "Reunião de Boas Vindas/Escopo - <ticket> - <empresa>" /
 *   "Treinamento PABX - ..." seguidas de "Quinta-feira, 24 de setembro · 3:00 – 4:00pm". Remarcação = vale a última.
 * - Sem agenda de treinamento: linha do checklist final ("Treinamento PABX - 22/09 - 14h").
 * - Domínio da plataforma: checklist ("DNS - cliente.eracloud.com.br") ou "URL de acesso: ...". Só o host sai daqui.
 *
 * SEGURANÇA: as ações trazem senhas de acesso do cliente. Só os campos abaixo saem daqui; o texto nunca.
 */

/** Data/hora local de São Paulo sem fuso: "2026-09-21" ou "2026-09-21T11:00". */
export type DataLocal = string

export interface AgendaTicket {
  quando: DataLocal
  /** 'agenda' = convite colado no ticket; 'mencao' = citado em texto (menos confiável). */
  origem: 'agenda' | 'mencao'
}

export interface DadosTicket {
  ticket: string
  assunto: string
  status?: string
  /** ISO UTC. */
  criadoEm?: string
  empresa?: string
  cnpj?: string
  contatoNome?: string
  telefone?: string
  reuniaoEscopo?: AgendaTicket
  treinamento?: AgendaTicket
  /** Ticket filho "Op. Assistida - ..." (onde vão as mensagens da operação assistida). */
  ticketOA?: { numero: string; assunto: string; status?: string; url: string }
  /** Host da plataforma do cliente ("oticasol.eracloud.com.br"). */
  dominio?: string
  url: string
  /** ISO de quando foi lido. */
  lidoEm: string
}

interface AcaoMovidesk { id: number; description?: string | null; htmlDescription?: string | null; createdDate?: string | null }
export interface TicketMovidesk {
  id: number | string
  subject?: string | null
  status?: string | null
  createdDate?: string | null
  actions?: AcaoMovidesk[] | null
  childrenTickets?: { id: number | string; subject?: string | null; isDeleted?: boolean }[] | null
}

const E_OA = /op\.?\s*assistida|opera[çc][ãa]o\s+assistida/i

/** Ticket de Operação Assistida: o próprio (se o card já aponta para ele) ou o filho "Op. Assistida - ..." mais recente. */
export function ticketOADe(t: TicketMovidesk): { numero: string; assunto: string } | undefined {
  if (E_OA.test(t.subject ?? '')) return { numero: String(t.id), assunto: (t.subject ?? '').trim() }
  const filho = [...(t.childrenTickets ?? [])]
    .filter((c) => !c.isDeleted && E_OA.test(c.subject ?? ''))
    .sort((a, b) => Number(b.id) - Number(a.id))[0]
  return filho ? { numero: String(filho.id), assunto: (filho.subject ?? '').trim() } : undefined
}

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

const ENTIDADES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** HTML da ação → texto em linhas. */
export function textoDaAcao(html: string | null | undefined): string {
  return (html ?? '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : ENTIDADES[e.toLowerCase()] ?? m))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

/** Nº do ticket no início ("114254 - NEVES TEC", "#114254 NEVES") ou no fim ("ESCOLA CRECHE LTDA - 112989"). */
export function ticketDoNome(nome: string): string | undefined {
  return nome.match(/^\s*#?(\d{5,7})\b/)?.[1] ?? nome.match(/[-–|#]\s*(\d{5,7})\s*$/)?.[1]
}

const pad = (n: number) => String(n).padStart(2, '0')
const digitos = (s: string) => s.replace(/\D/g, '')

function campo(texto: string, rotulos: string[]): string | undefined {
  for (const r of rotulos) {
    const m = texto.match(new RegExp(`^\\s*${r}\\s*:\\s*(.+)$`, 'im'))
    const v = m?.[1]?.trim()
    if (v) return v
  }
  return undefined
}

function formatarCnpj(v: string): string | undefined {
  const d = digitos(v)
  if (d.length !== 14) return v.trim() || undefined
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Ano do evento a partir da data da ação (agenda de janeiro enviada em dezembro = ano seguinte). */
function anoProvavel(mes: number, acaoISO?: string | null): number {
  const base = acaoISO ? new Date(acaoISO.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(acaoISO) ? acaoISO : acaoISO + 'Z') : new Date()
  const ano = base.getUTCFullYear()
  const mesAcao = base.getUTCMonth() + 1
  if (mes < mesAcao - 6) return ano + 1
  if (mes > mesAcao + 6) return ano - 1
  return ano
}

/** "3:00 – 4:00pm" → 15:00 · "11:00am – 12:00pm" → 11:00 · "15h às 16h" → 15:00. */
function horaInicial(texto: string): string | undefined {
  const faixa = texto.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (faixa) {
    const [, h1, m1 = '00', s1, h2, , s2] = faixa
    const para24 = (h: number, s?: string) => (s?.toLowerCase() === 'pm' ? (h % 12) + 12 : s?.toLowerCase() === 'am' ? h % 12 : h)
    let ini = para24(Number(h1), s1 ?? s2)
    const fim = para24(Number(h2), s2)
    if (!s1 && ini > fim) ini -= 12 // "11:00 – 12:00pm": o pm é do fim
    return `${pad(ini)}:${m1}`
  }
  const h = texto.match(/\b(\d{1,2})\s*h\s*(\d{2})?\b/i)
  if (h && Number(h[1]) < 24) return `${pad(Number(h[1]))}:${h[2] ?? '00'}`
  return undefined
}

type Tipo = 'escopo' | 'treinamento'
function tipoDoContexto(contexto: string): Tipo | undefined {
  if (/treinamento/i.test(contexto)) return 'treinamento'
  if (/reuni[aã]o|escopo|boas.?vindas|kick.?off/i.test(contexto)) return 'escopo'
  return undefined
}

const DIA_EXTENSO = /(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)(?:-feira)?,?\s*(\d{1,2})\s+de\s+([a-zç]+)/i

/** Agendas coladas no ticket (a última de cada tipo vence). */
function agendas(acoes: AcaoMovidesk[]): Partial<Record<Tipo, AgendaTicket>> {
  const achadas: Partial<Record<Tipo, AgendaTicket>> = {}
  for (const a of acoes) {
    const linhas = textoDaAcao(a.htmlDescription ?? a.description).split('\n')
    linhas.forEach((linha, i) => {
      if (/^\s*(enviado|sent|de|from)\s*:/i.test(linha)) return // cabeçalho de e-mail encaminhado
      const m = linha.match(DIA_EXTENSO)
      const mes = m ? MESES[m[3]!.toLowerCase().replace('ç', 'c')] ?? MESES[m[3]!.toLowerCase()] : undefined
      if (!m || !mes) return
      const tipo = tipoDoContexto([linhas[i - 2], linhas[i - 1], linha.slice(0, m.index)].filter(Boolean).join(' '))
      if (!tipo) return
      const dia = `${anoProvavel(mes, a.createdDate)}-${pad(mes)}-${pad(Number(m[2]))}`
      const hora = horaInicial(linha.slice(m.index! + m[0].length) + ' ' + (linhas[i + 1] ?? ''))
      achadas[tipo] = { quando: hora ? `${dia}T${hora}` : dia, origem: 'agenda' }
    })
  }
  return achadas
}

/** "Treinamento PABX - 22/09 - 14h" / "feito treinamento online 21/09" (ignora "Ofereci a data..."). */
function mencao(acoes: AcaoMovidesk[], tipo: Tipo): AgendaTicket | undefined {
  const inicio = tipo === 'treinamento' ? /^\s*treinamento\b/i : /^\s*(reuni[aã]o|escopo)\b/i
  let achada: AgendaTicket | undefined
  for (const a of acoes) {
    for (const linha of textoDaAcao(a.htmlDescription ?? a.description).split('\n')) {
      if (!inicio.test(linha) || /ofereci|oferecemos|sugeri|sugerimos|disponibilidade/i.test(linha)) continue
      const m = linha.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
      if (!m) continue
      const mes = Number(m[2])
      if (mes < 1 || mes > 12) continue
      const ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : anoProvavel(mes, a.createdDate)
      const hora = horaInicial(linha.slice(m.index! + m[0].length))
      achada = { quando: `${ano}-${pad(mes)}-${pad(Number(m[1]))}${hora ? 'T' + hora : ''}`, origem: 'mencao' }
    }
  }
  return achada
}

const HOST = /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?::\d+)?\b/i

/** Domínio de acesso: vale o último citado. Prefere *.eracloud.com.br; senão host rotulado como DNS/URL/domínio. */
export function dominioDoTicket(textos: string[]): string | undefined {
  let eracloud: string | undefined
  let rotulado: string | undefined
  for (const texto of textos) {
    for (const m of texto.matchAll(/\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.eracloud\.com\.br)\b/gi)) eracloud = m[1]!.toLowerCase()
    for (const linha of texto.split('\n')) {
      const r = linha.match(/^\s*(?:dns|url(?: de acesso)?|dom[ií]nio|link de acesso)\s*[-:–]\s*(?:https?:\/\/)?(\S+)/i)
      const h = r?.[1]?.match(HOST)?.[1]
      if (h && !/movidesk|google|drive|meet\./i.test(h)) rotulado = h.toLowerCase()
    }
  }
  return eracloud ?? rotulado
}

export function extrairDadosTicket(t: TicketMovidesk, urlApp = 'https://calliope.movidesk.com', agora = new Date()): DadosTicket {
  const acoes = [...(t.actions ?? [])].sort((a, b) => a.id - b.id)
  const textos = acoes.map((a) => textoDaAcao(a.htmlDescription ?? a.description))
  const form = textos.find((x) => /^\s*CNPJ\s*:/im.test(x) || /^\s*Nome da empresa\s*:/im.test(x)) ?? ''
  const assunto = (t.subject ?? '').trim()

  // Empresa: formulário; senão o 3º pedaço do assunto "1538 | NOVA ATIVAÇÃO | EMPRESA | VENDEDOR".
  const partes = assunto.replace(/^(re|res|fw|fwd|enc)\s*:\s*/i, '').split('|').map((p) => p.trim())
  const empresa = campo(form, ['Nome da empresa', 'Empresa', 'Raz[aã]o social']) ?? (partes.length >= 3 ? partes[2] : undefined)

  const cnpjCampo = campo(form, ['CNPJ', 'CPF/CNPJ'])
  const cnpjSolto = textos.slice(0, 3).join('\n').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/)?.[0]
  const telefoneCampo = [campo(form, ['Contato']), campo(form, ['Celular/WhatsApp', 'Celular', 'WhatsApp', 'Telefone'])]
    .find((v) => v && digitos(v).length >= 8)

  const achadas = agendas(acoes)
  const criado = t.createdDate ? (/[zZ]|[+-]\d\d:?\d\d$/.test(t.createdDate) ? t.createdDate : t.createdDate + 'Z') : undefined

  return {
    ticket: String(t.id),
    assunto,
    status: t.status ?? undefined,
    criadoEm: criado ? new Date(criado).toISOString() : undefined,
    empresa,
    cnpj: cnpjCampo ? formatarCnpj(cnpjCampo) : cnpjSolto ? formatarCnpj(cnpjSolto) : undefined,
    contatoNome: campo(form, ['Nome do respons[aá]vel', 'Respons[aá]vel']),
    telefone: telefoneCampo?.trim(),
    reuniaoEscopo: achadas.escopo ?? mencao(acoes, 'escopo'),
    treinamento: achadas.treinamento ?? mencao(acoes, 'treinamento'),
    dominio: dominioDoTicket(textos),
    ticketOA: (() => { const oa = ticketOADe(t); return oa ? { ...oa, url: `${urlApp}/Ticket/Edit/${oa.numero}` } : undefined })(),
    url: `${urlApp}/Ticket/Edit/${t.id}`,
    lidoEm: agora.toISOString(),
  }
}
