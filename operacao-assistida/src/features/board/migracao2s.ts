import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getRepository } from '@/data'
import type { Board, Card, Fase } from '@/domain/types'
import { diasDecorridos, diasEntre, hojeISO, somarDiasISO } from '@/domain/datas'
import { CICLO_2_SEMANAS, CORES_FASE, DESCRICAO_2S, ESTEIRA_2S_ANTIGA, ESTEIRA_REVISADA, KICKOFF_DIAS } from '@/domain/seed'
import type { Repository } from '@/data/repository'
import { useUI } from '@/store/uiStore'
import { chaves } from './useBoard'

/**
 * Ajustes da esteira padrão, aplicados sozinhos na primeira abertura do quadro:
 * 1) Kick-off + 2 semanas (pedido do Eduardo, 24/09/2026). Quadros criados antes disso têm Semana 3 e 4:
 *    elas são arquivadas (reversível em ⚙ Configurar), os cards delas vão para a Semana 2 e as cores passam a ser uma por etapa.
 * 2) Kick-off de 1 semana (02/10/2026; antes eram 2 dias): é o acompanhamento preliminar antes da Semana 1.
 *    Cards que o auto-avanço já tinha passado para a Semana 1 sem completar 7 dias voltam para o Kick-off
 *    (menos os fixados à mão). Ciclo vira 21 dias.
 * Roda uma vez por quadro (marca `configuracoes.esteiraVersao = ESTEIRA_REVISADA`); templates já nascem marcados.
 */
const ehSemana = (f: Fase, n: RegExp) => f.tipo === 'andamento' && n.test(f.nome.trim().toLowerCase())

function fasesDoAjuste(board: Board) {
  const ativas = board.fases.filter((f) => !f.arquivada)
  return {
    entrada: ativas.find((f) => f.tipo === 'entrada'),
    s1: ativas.find((f) => ehSemana(f, /^semana\s*1$/)),
    s2: ativas.find((f) => ehSemana(f, /^semana\s*2$/)),
    conclusao: ativas.find((f) => f.tipo === 'conclusao'),
    extras: ativas.filter((f) => ehSemana(f, /^semana\s*([3-9]|\d\d)$/)),
  }
}

const revisado = (board: Board) =>
  board.configuracoes.esteiraVersao === ESTEIRA_REVISADA || board.configuracoes.esteiraVersao === ESTEIRA_2S_ANTIGA

/** true enquanto o quadro ainda tem a esteira antiga (Semana 3+) e não foi ajustado. */
export function precisaMigrar2S(board: Board): boolean {
  if (revisado(board)) return false
  const { s2, extras } = fasesDoAjuste(board)
  return !!s2 && extras.length > 0
}

/** true para quadro de 2 semanas cujo Kick-off ainda dura menos de 1 semana (os de 4+ semanas não são mexidos). */
export function precisaKickoff7(board: Board): boolean {
  if (board.configuracoes.esteiraVersao === ESTEIRA_REVISADA) return false
  const { entrada, s1, s2, extras } = fasesDoAjuste(board)
  return !!entrada && entrada.duracaoDias < KICKOFF_DIAS && !!s1 && !!s2 && extras.length === 0
}

/** Algum ajuste pendente — o auto-avanço espera ele terminar. */
export function precisaAjustarEsteira(board: Board): boolean {
  return precisaMigrar2S(board) || precisaKickoff7(board)
}

/** Ajuste em si (sem React): testável com o MockRepository. */
export async function ajustarEsteira(repo: Repository, board: Board, cards: Card[]): Promise<void> {
  const { entrada, s1, s2, conclusao, extras } = fasesDoAjuste(board)
  const fuso = board.configuracoes.fusoHorario
  const agora = new Date().toISOString()
  const hoje = hojeISO(fuso)
  const cicloAntigo = board.configuracoes.duracaoCicloDias
  const encurtar = precisaMigrar2S(board)

  if (encurtar) {
    // 1) Cards que estavam na Semana 3+ vão para a Semana 2
    const idsExtras = new Set(extras.map((f) => f.id))
    for (const c of cards.filter((x) => idsExtras.has(x.faseId))) {
      await repo.atualizarCard(c.id, { faseId: s2!.id, dataEntradaNaFase: agora })
      if (c.status === 'ativo' || c.status === 'pausado') {
        await repo.criarEvento({
          cardId: c.id, tipo: 'mudanca_de_fase', titulo: `Movido para ${s2!.nome}`,
          descricao: 'A operação assistida passou a ter 2 semanas; a fase anterior foi arquivada.',
          dataHora: agora, autorNome: 'Sistema', origem: 'manual', geradoPeloSistema: true,
          meta: { deFaseId: c.faseId, paraFaseId: s2!.id, automatico: true },
        })
      }
    }
    // 2) Semana 3+ arquivadas; uma cor por etapa
    for (const f of extras) await repo.atualizarFase(f.id, { arquivada: true })
    const cores: [Fase | undefined, string][] = [
      [entrada, CORES_FASE.entrada], [s1, CORES_FASE.semana1], [s2, CORES_FASE.semana2], [conclusao, CORES_FASE.conclusao],
    ]
    for (const [f, cor] of cores) if (f && f.cor !== cor) await repo.atualizarFase(f.id, { cor })
  }

  // 3) Kick-off de 1 semana; quem saiu dele antes dos 7 dias pelo auto-avanço volta
  if (entrada && entrada.duracaoDias < KICKOFF_DIAS) {
    await repo.atualizarFase(entrada.id, { duracaoDias: KICKOFF_DIAS })
    for (const c of cards) {
      if (!s1 || c.faseId !== s1.id || c.status !== 'ativo' || c.travadoManualmente) continue
      if (diasDecorridos(c.dataEntrada, hoje, fuso) >= KICKOFF_DIAS) continue
      await repo.atualizarCard(c.id, { faseId: entrada.id, dataEntradaNaFase: c.dataEntrada })
      await repo.criarEvento({
        cardId: c.id, tipo: 'mudanca_de_fase', titulo: `Voltou para ${entrada.nome}`,
        descricao: `O kick-off passou a durar ${KICKOFF_DIAS} dias (acompanhamento preliminar antes da ${s1.nome}).`,
        dataHora: agora, autorNome: 'Sistema', origem: 'manual', geradoPeloSistema: true,
        meta: { deFaseId: c.faseId, paraFaseId: entrada.id, automatico: true },
      })
    }
  }

  // 4) Saída prevista dos ativos que ainda seguem o ciclo antigo (datas editadas à mão ficam como estão)
  if (cicloAntigo !== CICLO_2_SEMANAS) {
    for (const c of cards) {
      if (c.status !== 'ativo' && c.status !== 'pausado') continue
      if (diasEntre(c.dataEntrada, c.dataPrevistaSaida, fuso) !== cicloAntigo) continue
      await repo.atualizarCard(c.id, { dataPrevistaSaida: somarDiasISO(c.dataEntrada, CICLO_2_SEMANAS, fuso) })
    }
  }

  // 5) Ciclo e descrição do quadro
  const descricaoAntiga = !board.descricao || /4 semanas|30 dias|^Kick-off \+ 2 semanas/i.test(board.descricao)
  await repo.atualizarBoard(board.id, {
    ...(descricaoAntiga ? { descricao: DESCRICAO_2S } : {}),
    configuracoes: { ...board.configuracoes, duracaoCicloDias: CICLO_2_SEMANAS, esteiraVersao: ESTEIRA_REVISADA },
  })
}

export function useMigracaoDuasSemanas(board: Board | undefined, cards: Card[] | undefined) {
  const qc = useQueryClient()
  const notificar = useUI((s) => s.notificar)
  const rodou = useRef<string | null>(null)

  useEffect(() => {
    if (!board || !cards || rodou.current === board.id || !precisaAjustarEsteira(board)) return
    rodou.current = board.id
    ;(async () => {
      try {
        await ajustarEsteira(getRepository(), board, cards)
        notificar({ mensagem: `Operação assistida ajustada: Kick-off de ${KICKOFF_DIAS} dias + 2 semanas (ciclo de ${CICLO_2_SEMANAS} dias).` })
      } catch (erro) {
        console.error('[operacao-assistida] ajuste da esteira falhou', erro)
        rodou.current = null
        notificar({ mensagem: 'Não deu para ajustar a esteira. Recarregue a página.' })
      } finally {
        await Promise.all([
          qc.invalidateQueries({ queryKey: chaves.board(board.id) }),
          qc.invalidateQueries({ queryKey: chaves.boards }),
          qc.invalidateQueries({ queryKey: chaves.cards(board.id) }),
        ])
      }
    })()
  }, [board, cards, qc, notificar])
}
