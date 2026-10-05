import { describe, expect, it } from 'vitest'
import type { Card, Filtros } from './types'
import { FILTROS_VAZIOS } from './types'
import { aplicarFiltros } from './filtros'
import {
  CHAVE_INTEGRACAO, CHAVE_INTEGRACAO_QUAL, CHAVE_TIP, CHAVE_VENDEDOR,
  ehTip, integracaoDoCard, SEM_VENDEDOR, selosComerciais, setTip, setVendedor, vendedorDoCard,
} from './comercial'

const card = (extras: Card['camposCustomizados'] = {}): Card => ({
  id: 'c1', boardId: 'b1', codigo: 'OA-0001', clienteNome: 'Cliente Teste',
  coResponsaveisIds: [], dataEntrada: '2026-10-01T00:00:00.000Z', dataPrevistaSaida: '2026-10-17T00:00:00.000Z',
  faseId: 'f1', dataEntradaNaFase: '2026-10-01T00:00:00.000Z', status: 'ativo', prioridade: 'media',
  saude: 'verde', tags: [], travadoManualmente: false, checklist: [], anexos: [],
  camposCustomizados: extras, criadoEm: '2026-10-01T00:00:00.000Z', atualizadoEm: '2026-10-01T00:00:00.000Z',
})

const filtrar = (cards: Card[], f: Partial<Filtros>) => aplicarFiltros(cards, { ...FILTROS_VAZIOS, ...f }, () => 'verde')

describe('dados comerciais do card', () => {
  it('lê vendedor, TIP e integração das chaves reservadas', () => {
    const c = card({ [CHAVE_VENDEDOR]: 'Nicole', [CHAVE_TIP]: true, [CHAVE_INTEGRACAO]: 'sim' })
    expect(vendedorDoCard(c)).toBe('Nicole')
    expect(ehTip(c)).toBe(true)
    expect(integracaoDoCard(c)).toBe('sim')
  })

  it('card sem os campos não inventa valor', () => {
    const c = card()
    expect(vendedorDoCard(c)).toBeUndefined()
    expect(ehTip(c)).toBe(false)
    expect(integracaoDoCard(c)).toBeUndefined()
    expect(selosComerciais(c)).toEqual([])
  })

  it('desmarcar TIP e limpar vendedor apagam a chave em vez de gravar vazio', () => {
    const c = card({ [CHAVE_VENDEDOR]: 'Gustavo', [CHAVE_TIP]: true })
    expect(setTip(c, false)).not.toHaveProperty(CHAVE_TIP)
    expect(setVendedor(c, undefined)).not.toHaveProperty(CHAVE_VENDEDOR)
  })

  it('selo da integração mostra qual é, e "sem integração" quando é não', () => {
    const com = selosComerciais(card({ [CHAVE_INTEGRACAO]: 'sim', [CHAVE_INTEGRACAO_QUAL]: 'CRM' }))
    expect(com.find((s) => s.chave === 'integracao')?.rotulo).toContain('CRM')
    const sem = selosComerciais(card({ [CHAVE_INTEGRACAO]: 'nao' }))
    expect(sem.find((s) => s.chave === 'integracao')?.rotulo).toBe('sem integração')
  })

  it('filtra por vendedor, por TIP e por integração', () => {
    const nicole = { ...card({ [CHAVE_VENDEDOR]: 'Nicole', [CHAVE_INTEGRACAO]: 'sim' }), id: 'a' }
    const tip = { ...card({ [CHAVE_TIP]: true }), id: 'b' }
    const vazio = { ...card(), id: 'c' }
    const todos = [nicole, tip, vazio]
    expect(filtrar(todos, { vendedores: ['Nicole'] }).map((c) => c.id)).toEqual(['a'])
    expect(filtrar(todos, { vendedores: [SEM_VENDEDOR] }).map((c) => c.id)).toEqual(['b', 'c'])
    expect(filtrar(todos, { origens: ['tip'] }).map((c) => c.id)).toEqual(['b'])
    expect(filtrar(todos, { integracoes: ['sim'] }).map((c) => c.id)).toEqual(['a'])
    expect(filtrar(todos, { integracoes: ['nd'] }).map((c) => c.id)).toEqual(['b', 'c'])
  })

  it('visão salva antes dos campos comerciais continua valendo (chaves ausentes)', () => {
    const antiga = { busca: '', responsavelIds: [], faseIds: [], saudes: [], prioridades: [], tags: [], status: [] } as Filtros
    expect(aplicarFiltros([card()], antiga, () => 'verde')).toHaveLength(1)
  })

  it('busca encontra o card pelo vendedor e por TIP', () => {
    const nicole = { ...card({ [CHAVE_VENDEDOR]: 'Nicole' }), id: 'a' }
    const tip = { ...card({ [CHAVE_TIP]: true }), id: 'b' }
    expect(filtrar([nicole, tip], { busca: 'nicole' }).map((c) => c.id)).toEqual(['a'])
    expect(filtrar([nicole, tip], { busca: 'tip' }).map((c) => c.id)).toEqual(['b'])
  })
})
