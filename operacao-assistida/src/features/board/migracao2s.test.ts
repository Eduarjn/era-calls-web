import { describe, expect, it } from 'vitest'
import { MockRepository } from '@/data/mockRepository'
import { CONFIG_PADRAO, ESTEIRA_2S_ANTIGA, FASES_PADRAO_2S, FASES_PADRAO_30D, TEMPLATES_PADRAO } from '@/domain/seed'
import { diasEntre, hojeISO, somarDiasISO } from '@/domain/datas'
import { faseEsperada, fasesOrdenadas } from '@/domain/esteira'
import { ajustarEsteira, precisaAjustarEsteira, precisaKickoff7, precisaMigrar2S } from './migracao2s'

const FUSO = CONFIG_PADRAO.fusoHorario

describe('ajuste da esteira para 2 semanas', () => {
  it('quadro antigo de 4 semanas: arquiva Semana 3/4, move cards, kick-off 7 d, ciclo 21 d, respeita data editada à mão', async () => {
    const repo = new MockRepository()
    // Quadro como o que está no ar: criado antes do ajuste, sem a marca de revisado.
    const antigo = await repo.criarBoard('Antigo', {
      id: 'x', nome: 'Antigo', descricao: 'Kick-off + 4 semanas + finalização. Auto-avanço ligado.',
      configuracoes: { ...CONFIG_PADRAO, duracaoCicloDias: 30 }, fases: FASES_PADRAO_30D,
    })
    expect(precisaMigrar2S(antigo)).toBe(true)

    const porNome = (n: string) => antigo.fases.find((f) => f.nome === n)!
    const hoje = hojeISO(FUSO)
    const entrada = somarDiasISO(hoje, -20, FUSO)
    const naS3 = await repo.criarCard({ boardId: antigo.id, clienteNome: 'Na semana 3', faseId: porNome('Semana 3').id, dataEntrada: entrada })
    const dataManual = somarDiasISO(hoje, 45, FUSO)
    const manual = await repo.criarCard({ boardId: antigo.id, clienteNome: 'Data à mão', faseId: porNome('Semana 1').id, dataEntrada: somarDiasISO(hoje, -10, FUSO), dataPrevistaSaida: dataManual })

    await ajustarEsteira(repo, antigo, await repo.listarCards(antigo.id))

    const depois = (await repo.obterBoard(antigo.id))!
    expect(fasesOrdenadas(depois.fases).map((f) => f.nome)).toEqual(['Entrada / Kick-off', 'Semana 1', 'Semana 2', 'Finalização'])
    expect(fasesOrdenadas(depois.fases)[0]!.duracaoDias).toBe(7)
    expect(new Set(fasesOrdenadas(depois.fases).map((f) => f.cor)).size).toBe(4) // uma cor por etapa
    expect(depois.configuracoes.duracaoCicloDias).toBe(21)
    expect(depois.descricao).toMatch(/1 semana/)
    expect(precisaAjustarEsteira(depois)).toBe(false)

    const s3 = (await repo.obterCard(naS3.id))!
    expect(s3.faseId).toBe(porNome('Semana 2').id)
    expect(diasEntre(s3.dataEntrada, s3.dataPrevistaSaida, FUSO)).toBe(21)
    expect((await repo.obterCard(manual.id))!.dataPrevistaSaida).toBe(dataManual)
  })

  it('quadro de 2 semanas com kick-off de 2 dias: kick-off vira 7 d e quem saiu antes dos 7 dias volta', async () => {
    const repo = new MockRepository()
    const k2 = FASES_PADRAO_2S.map((f) => (f.tipo === 'entrada' ? { ...f, duracaoDias: 2 } : f))
    const board = await repo.criarBoard('No ar', {
      id: 'y', nome: 'No ar', descricao: 'Kick-off + 2 semanas + finalização. Auto-avanço ligado.',
      configuracoes: { ...CONFIG_PADRAO, duracaoCicloDias: 16, esteiraVersao: ESTEIRA_2S_ANTIGA }, fases: k2,
    })
    expect(precisaMigrar2S(board)).toBe(false)
    expect(precisaKickoff7(board)).toBe(true)

    const porNome = (n: string) => board.fases.find((f) => f.nome === n)!
    const hoje = hojeISO(FUSO)
    const ha = (d: number) => somarDiasISO(hoje, -d, FUSO)
    const recente = await repo.criarCard({ boardId: board.id, clienteNome: 'Entrou há 3 dias', faseId: porNome('Semana 1').id, dataEntrada: ha(3) })
    const fixado = await repo.criarCard({ boardId: board.id, clienteNome: 'Fixado', faseId: porNome('Semana 1').id, dataEntrada: ha(3) })
    await repo.atualizarCard(fixado.id, { travadoManualmente: true })
    const antigo = await repo.criarCard({ boardId: board.id, clienteNome: 'Entrou há 9 dias', faseId: porNome('Semana 1').id, dataEntrada: ha(9) })
    const noKick = await repo.criarCard({ boardId: board.id, clienteNome: 'Entrou hoje', faseId: porNome('Entrada / Kick-off').id, dataEntrada: hoje })

    await ajustarEsteira(repo, board, await repo.listarCards(board.id))

    const depois = (await repo.obterBoard(board.id))!
    expect(precisaAjustarEsteira(depois)).toBe(false)
    expect(depois.configuracoes.duracaoCicloDias).toBe(21)
    expect(depois.descricao).toMatch(/1 semana/)
    const kick = porNome('Entrada / Kick-off').id
    expect((await repo.obterCard(recente.id))!.faseId).toBe(kick)
    expect((await repo.obterCard(fixado.id))!.faseId).toBe(porNome('Semana 1').id)
    expect((await repo.obterCard(antigo.id))!.faseId).toBe(porNome('Semana 1').id)
    const n = (await repo.obterCard(noKick.id))!
    expect(diasEntre(n.dataEntrada, n.dataPrevistaSaida, FUSO)).toBe(21)
    // Regra de tempo nova: 6 dias ainda é kick-off, 7 já é Semana 1
    expect(faseEsperada({ ...n, dataEntrada: ha(6) }, depois.fases, hoje, FUSO)!.faseId).toBe(kick)
    expect(faseEsperada({ ...n, dataEntrada: ha(7) }, depois.fases, hoje, FUSO)!.faseId).toBe(porNome('Semana 1').id)
  })

  it('quadros criados pelos templates (inclusive o de 30 dias) não são mexidos', async () => {
    const repo = new MockRepository()
    for (const t of TEMPLATES_PADRAO) expect(precisaAjustarEsteira(await repo.criarBoard(t.nome, t))).toBe(false)
  })

  it('quadro de 30 dias da versão de 24/09 não ganha o ajuste do kick-off', async () => {
    const repo = new MockRepository()
    const b = await repo.criarBoard('30d', { ...TEMPLATES_PADRAO[1]!, configuracoes: { ...TEMPLATES_PADRAO[1]!.configuracoes, esteiraVersao: ESTEIRA_2S_ANTIGA } })
    expect(precisaAjustarEsteira(b)).toBe(false)
  })
})
