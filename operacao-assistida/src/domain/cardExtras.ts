import type { Card, Usuario } from './types'

/**
 * Dados do card guardados em `camposCustomizados` com chave reservada (começa com "_"),
 * para não exigir coluna nova no banco. Chaves "_" nunca aparecem como campo customizado.
 */
export const CHAVE_COR = '_cor'
export const CHAVE_RESPONSAVEL_NOME = '_responsavel_nome'

export const chaveReservada = (chave: string) => chave.startsWith('_')

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Cor escolhida para o card (hex) ou undefined. */
export function corDoCard(card: Card): string | undefined {
  return texto(card.camposCustomizados?.[CHAVE_COR])
}

/** Nome digitado para o responsável quando ele não é usuário da plataforma. */
export function responsavelDigitado(card: Card): string | undefined {
  return texto(card.camposCustomizados?.[CHAVE_RESPONSAVEL_NOME])
}

/** Nome do responsável: usuário da plataforma ou, na falta dele, o nome digitado. */
export function nomeResponsavel(card: Card, usuarios: Usuario[]): string | undefined {
  const u = card.responsavelId ? usuarios.find((x) => x.id === card.responsavelId) : undefined
  return u?.nome ?? responsavelDigitado(card)
}

/** camposCustomizados com uma chave trocada (valor vazio remove a chave). */
export function comCampo(card: Card, chave: string, valor: string | undefined): Card['camposCustomizados'] {
  const novo = { ...card.camposCustomizados }
  if (valor && valor.trim()) novo[chave] = valor.trim()
  else delete novo[chave]
  return novo
}
