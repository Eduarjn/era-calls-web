import { describe, expect, it } from 'vitest'
import type { Card, Fase } from './types'
import { FASES_PADRAO_30D } from './seed'
import { aguardandoFinalizacao, calcularSaude, faseEsperada, foraDaEsteira, reconciliar } from './esteira'
import { diasEntre, hojeISO, somarDiasISO } from './datas'

const FUSO = 'America/Sao_Paulo'

const fases: Fase[] = FASES_PADRAO_30D.map((f, i) => ({ ...f, id: `f${i}`, boardId: 'b' }))
// f0 Entrada (2d) · f1 S1 (7d) · f2 S2 (7d) · f3 S3 (7d) · f4 S4 (7d) · f5 Finalização

function card(p: Partial<Card> & { dataEntrada: string; faseId: string }): Card {
  return {
    id: 'c', boardId: 'b', codigo: 'OA-0001', clienteNome: 'X', coResponsaveisIds: [],
    dataPrevistaSaida: somarDiasISO(p.dataEntrada, 30, FUSO), dataEntradaNaFase: p.dataEntrada,
    status: 'ativo', prioridade: 'media', saude: 'verde', tags: [], travadoManualmente: false,
    checklist: [], anexos: [], camposCustomizados: {}, criadoEm: p.dataEntrada, atualizadoEm: p.dataEntrada,
    ...p,
  }
}

describe('faseEsperada', () => {
  it('dia 0 e 1 ficam na Entrada; dia 2 vai para Semana 1', () => {
    const hoje = '2026-09-10T03:00:00.000Z' // 10/09 00:00 em SP
    expect(faseEsperada(card({ dataEntrada: somarDiasISO(hoje, 0, FUSO), faseId: 'f0' }), fases, hoje, FUSO)?.faseId).toBe('f0')
    expect(faseEsperada(card({ dataEntrada: somarDiasISO(hoje, -1, FUSO), faseId: 'f0' }), fases, hoje, FUSO)?.faseId).toBe('f0')
    expect(faseEsperada(card({ dataEntrada: somarDiasISO(hoje, -2, FUSO), faseId: 'f0' }), fases, hoje, FUSO)?.faseId).toBe('f1')
  })

  it('virada de mês: entrou 28/08, hoje 03/09 → 6 dias → Semana 1', () => {
    const hoje = '2026-09-03T12:00:00.000Z'
    const r = faseEsperada(card({ dataEntrada: '2026-08-28T12:00:00.000Z', faseId: 'f0' }), fases, hoje, FUSO)
    expect(r?.diasDecorridos).toBe(6)
    expect(r?.faseId).toBe('f1')
  })

  it('fuso: 02:30 UTC ainda é o dia anterior em São Paulo', () => {
    // 01/09 02:30Z = 31/08 23:30 em SP → conta como 31/08
    expect(diasEntre('2026-09-01T02:30:00.000Z', '2026-09-01T12:00:00.000Z', FUSO)).toBe(1)
    expect(diasEntre('2026-09-01T02:30:00.000Z', '2026-09-01T12:00:00.000Z', 'UTC')).toBe(0)
  })

  it('passou dos 30 dias → aguardando finalização na última fase da esteira', () => {
    const hoje = '2026-09-10T12:00:00.000Z'
    const r = faseEsperada(card({ dataEntrada: somarDiasISO(hoje, -33, FUSO), faseId: 'f4' }), fases, hoje, FUSO)
    expect(r?.faseId).toBe('f4')
    expect(r?.aguardandoFinalizacao).toBe(true)
    expect(aguardandoFinalizacao(card({ dataEntrada: somarDiasISO(hoje, -33, FUSO), faseId: 'f4' }), fases, hoje, FUSO)).toBe(true)
  })

  it('ciclo customizado de 3 dias por fase', () => {
    const curtas = fases.map((f) => (f.tipo === 'andamento' ? { ...f, duracaoDias: 3 } : f))
    const hoje = '2026-09-10T12:00:00.000Z'
    // 2 (entrada) + 3 + 3 = 8 → dia 8 é Semana 3
    expect(faseEsperada(card({ dataEntrada: somarDiasISO(hoje, -8, FUSO), faseId: 'f0' }), curtas, hoje, FUSO)?.faseId).toBe('f3')
  })

  it('fase com regra "nunca" segura o card', () => {
    const comParede = fases.map((f) => (f.id === 'f2' ? { ...f, regraAutoAvanco: { tipo: 'nunca' as const } } : f))
    const hoje = '2026-09-10T12:00:00.000Z'
    expect(faseEsperada(card({ dataEntrada: somarDiasISO(hoje, -25, FUSO), faseId: 'f0' }), comParede, hoje, FUSO)?.faseId).toBe('f2')
  })
})

describe('reconciliar', () => {
  const hoje = '2026-09-10T12:00:00.000Z'
  const atrasado = card({ id: 'a', dataEntrada: somarDiasISO(hoje, -12, FUSO), faseId: 'f1' }) // deveria estar em S2

  it('avança quem está atrás', () => {
    const m = reconciliar([atrasado], fases, true, hoje, FUSO)
    expect(m).toHaveLength(1)
    expect(m[0]!.paraFaseId).toBe('f2')
  })

  it('não mexe em pausado, fixado, finalizado nem com automação desligada', () => {
    expect(reconciliar([{ ...atrasado, status: 'pausado' }], fases, true, hoje, FUSO)).toHaveLength(0)
    expect(reconciliar([{ ...atrasado, travadoManualmente: true }], fases, true, hoje, FUSO)).toHaveLength(0)
    expect(reconciliar([{ ...atrasado, status: 'finalizado' }], fases, true, hoje, FUSO)).toHaveLength(0)
    expect(reconciliar([atrasado], fases, false, hoje, FUSO)).toHaveLength(0)
  })

  it('nunca volta quem foi adiantado manualmente nem entra na conclusão', () => {
    const adiantado = card({ dataEntrada: somarDiasISO(hoje, -3, FUSO), faseId: 'f4' })
    expect(reconciliar([adiantado], fases, true, hoje, FUSO)).toHaveLength(0)
    const vencido = card({ dataEntrada: somarDiasISO(hoje, -40, FUSO), faseId: 'f4' })
    expect(reconciliar([vencido], fases, true, hoje, FUSO)).toHaveLength(0)
    expect(foraDaEsteira(adiantado, fases, hoje, FUSO)).toBe('adiante')
  })
})

describe('calcularSaude', () => {
  const hoje = hojeISO(FUSO)
  it('verde em dia, amarelo perto do fim, vermelho vencido', () => {
    const emDia = card({ dataEntrada: somarDiasISO(hoje, -5, FUSO), faseId: 'f1' })
    expect(calcularSaude(emDia, fases, hoje, FUSO)).toBe('verde')
    const pertoDoFim = card({ dataEntrada: somarDiasISO(hoje, -28, FUSO), faseId: 'f4' })
    expect(calcularSaude(pertoDoFim, fases, hoje, FUSO)).toBe('amarelo')
    const vencido = card({ dataEntrada: somarDiasISO(hoje, -31, FUSO), faseId: 'f4' })
    expect(calcularSaude(vencido, fases, hoje, FUSO)).toBe('vermelho')
  })
  it('ação atrasada e atraso na esteira', () => {
    const acaoAtrasada = card({ dataEntrada: somarDiasISO(hoje, -5, FUSO), faseId: 'f1', proximaAcao: { descricao: 'x', dataPrazo: somarDiasISO(hoje, -3, FUSO) } })
    expect(calcularSaude(acaoAtrasada, fases, hoje, FUSO)).toBe('vermelho')
    const atrasBastante = card({ dataEntrada: somarDiasISO(hoje, -14, FUSO), faseId: 'f1', travadoManualmente: true })
    expect(calcularSaude(atrasBastante, fases, hoje, FUSO)).toBe('vermelho')
    const atrasPouco = card({ dataEntrada: somarDiasISO(hoje, -9, FUSO), faseId: 'f1', travadoManualmente: true })
    expect(calcularSaude(atrasPouco, fases, hoje, FUSO)).toBe('amarelo')
  })
  it('manual vence a regra', () => {
    const vencido = card({ dataEntrada: somarDiasISO(hoje, -31, FUSO), faseId: 'f4', saudeManual: 'verde' })
    expect(calcularSaude(vencido, fases, hoje, FUSO)).toBe('verde')
  })
})
