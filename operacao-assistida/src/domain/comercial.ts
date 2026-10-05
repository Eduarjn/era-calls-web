/**
 * Dados comerciais do card: quem vendeu, se o cliente veio da TIP e se tem integração.
 *
 * Ficam em `camposCustomizados` com chave reservada ("_"), do mesmo jeito que a cor e o nome
 * do responsável (ver cardExtras.ts): não exigem coluna nova no banco, não aparecem como campo
 * customizado do board e viajam junto do card em qualquer repositório (mock ou Supabase).
 *
 * Hoje o preenchimento é manual (painel do card, lista ou importação em lote). O vendedor e a
 * origem TIP também existem no assunto do ticket do Movidesk (`código | TIPO | cliente | vendedor`),
 * que é de onde dá para preencher sozinho mais adiante.
 */
import type { Card } from './types'
import { comCampo } from './cardExtras'

export const CHAVE_VENDEDOR = '_vendedor'
export const CHAVE_TIP = '_tip'
export const CHAVE_INTEGRACAO = '_integracao'
export const CHAVE_INTEGRACAO_QUAL = '_integracao_qual'

/** Vendedores internos da ERA, como o time fala. Para incluir alguém, acrescente aqui. */
export const VENDEDORES_INTERNOS = ['Nicole', 'Junior Salim', 'Gustavo']

/** Valor do filtro para "card sem vendedor preenchido". */
export const SEM_VENDEDOR = '__sem'

export type Integracao = 'sim' | 'nao'
export const ROTULO_INTEGRACAO: Record<Integracao, string> = { sim: 'Com integração', nao: 'Sem integração' }
/** Terceira opção do filtro: ninguém preencheu ainda. */
export const INTEGRACAO_NAO_INFORMADA = 'nd'
export type FiltroIntegracao = Integracao | typeof INTEGRACAO_NAO_INFORMADA

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Vendedor interno responsável pela venda, ou undefined. */
export function vendedorDoCard(card: Card): string | undefined {
  return texto(card.camposCustomizados?.[CHAVE_VENDEDOR])
}

/** Cliente trazido pela TIP (parceiro). */
export function ehTip(card: Card): boolean {
  const v = card.camposCustomizados?.[CHAVE_TIP]
  return v === true || v === 'sim' || v === 'TIP'
}

/** 'sim' | 'nao' | undefined (não informado). */
export function integracaoDoCard(card: Card): Integracao | undefined {
  const v = texto(card.camposCustomizados?.[CHAVE_INTEGRACAO])?.toLowerCase()
  return v === 'sim' || v === 'nao' ? v : undefined
}

/** Qual integração o cliente usa (texto livre: CRM, ERP, API…). */
export function integracaoQual(card: Card): string | undefined {
  return texto(card.camposCustomizados?.[CHAVE_INTEGRACAO_QUAL])
}

/** Como o filtro classifica a integração do card. */
export function filtroIntegracaoDo(card: Card): FiltroIntegracao {
  return integracaoDoCard(card) ?? INTEGRACAO_NAO_INFORMADA
}

export const setVendedor = (card: Card, nome: string | undefined) => comCampo(card, CHAVE_VENDEDOR, nome)
export const setIntegracao = (card: Card, v: Integracao | undefined) => comCampo(card, CHAVE_INTEGRACAO, v)
export const setIntegracaoQual = (card: Card, v: string | undefined) => comCampo(card, CHAVE_INTEGRACAO_QUAL, v)

/** TIP é booleano: marcado grava `true`, desmarcado apaga a chave. */
export function setTip(card: Card, tip: boolean): Card['camposCustomizados'] {
  const novo = { ...card.camposCustomizados }
  if (tip) novo[CHAVE_TIP] = true
  else delete novo[CHAVE_TIP]
  return novo
}

export interface SeloComercial {
  chave: 'vendedor' | 'tip' | 'integracao'
  rotulo: string
  cor: string
  title: string
}

/**
 * Selos comerciais do card, na ordem em que aparecem no kanban.
 * "Sem integração" também aparece: para o acompanhamento, não ter integração é informação.
 */
export function selosComerciais(card: Card): SeloComercial[] {
  const selos: SeloComercial[] = []
  const vend = vendedorDoCard(card)
  if (vend) selos.push({ chave: 'vendedor', rotulo: `👤 ${vend}`, cor: 'var(--muted)', title: `Venda interna: ${vend}` })
  if (ehTip(card)) selos.push({ chave: 'tip', rotulo: 'TIP', cor: 'var(--accent2)', title: 'Cliente trazido pela TIP' })
  const integ = integracaoDoCard(card)
  if (integ === 'sim') {
    const qual = integracaoQual(card)
    selos.push({ chave: 'integracao', rotulo: `🔌 integração${qual ? ` · ${qual}` : ''}`, cor: 'var(--blue)', title: qual ? `Integração: ${qual}` : 'Cliente com integração' })
  } else if (integ === 'nao') {
    selos.push({ chave: 'integracao', rotulo: 'sem integração', cor: 'var(--muted)', title: 'Cliente sem integração' })
  }
  return selos
}
