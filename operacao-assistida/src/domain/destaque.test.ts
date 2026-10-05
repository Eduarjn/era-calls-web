import { describe, expect, it } from 'vitest'
import { alertaDo } from './destaque'

describe('alertaDo', () => {
  it('saudável com prioridade baixa ou média não alerta', () => {
    expect(alertaDo('verde', 'baixa')).toBe('normal')
    expect(alertaDo('verde', 'media')).toBe('normal')
  })
  it('atenção vem da saúde amarela ou da prioridade alta', () => {
    expect(alertaDo('amarelo', 'media')).toBe('atencao')
    expect(alertaDo('verde', 'alta')).toBe('atencao')
    expect(alertaDo('amarelo', 'alta')).toBe('atencao')
  })
  it('em risco sozinho ou crítica saudável é risco', () => {
    expect(alertaDo('vermelho', 'media')).toBe('risco')
    expect(alertaDo('verde', 'critica')).toBe('risco')
  })
  it('em risco com prioridade alta/crítica, ou crítica fora do verde, é urgente', () => {
    expect(alertaDo('vermelho', 'alta')).toBe('urgente')
    expect(alertaDo('vermelho', 'critica')).toBe('urgente')
    expect(alertaDo('amarelo', 'critica')).toBe('urgente')
  })
})
