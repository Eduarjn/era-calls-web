import { nanoid } from 'nanoid'
import type {
  Board, Card, Evento, Fase, Id, NovoCard, NovoEvento, PatchCard, TemplateBoard, Usuario, VisaoSalva,
} from '@/domain/types'
import { CONFIG_PADRAO, TEMPLATES_PADRAO } from '@/domain/seed'
import { hojeISO, somarDiasISO } from '@/domain/datas'
import { RepositoryError, type Repository } from './repository'
import { CONFIG_INTEGRACAO_PADRAO, type ConfigIntegracao } from '@/integrations/types'

const LATENCIA_MS = 90

const dormir = (ms = LATENCIA_MS) => new Promise((r) => setTimeout(r, ms))
const agoraISO = () => new Date().toISOString()
const clone = <T>(v: T): T => structuredClone(v)

const USUARIOS: Usuario[] = [
  { id: 'u-eduardo', nome: 'Eduardo', email: 'eduardo@era.com.br', papel: 'gestor' },
  { id: 'u-ana', nome: 'Ana Souza', email: 'ana@era.com.br', papel: 'cs' },
  { id: 'u-rafael', nome: 'Rafael Lima', email: 'rafael@era.com.br', papel: 'cs' },
]

/**
 * Repositório em memória com dados de exemplo.
 * Simula latência de rede para os skeletons e a atualização otimista serem visíveis.
 */
export class MockRepository implements Repository {
  private boards = new Map<Id, Board>()
  private fases = new Map<Id, Fase>()
  private cards = new Map<Id, Card>()
  private eventos = new Map<Id, Evento>()
  private templates: TemplateBoard[] = clone(TEMPLATES_PADRAO)
  private seqCodigo = 0

  constructor() {
    this.semear()
  }

  // ---------- Usuários ----------
  async listarUsuarios() { await dormir(60); return clone(USUARIOS) }
  async usuarioAtual() { return clone(USUARIOS[0]) }

  // ---------- Boards ----------
  async listarBoards() { await dormir(); return [...this.boards.values()].map((b) => this.montarBoard(b)) }
  async obterBoard(id: Id) { await dormir(); const b = this.boards.get(id); return b ? this.montarBoard(b) : null }

  async criarBoard(nome: string, template: TemplateBoard) {
    await dormir()
    const id = nanoid(10)
    const board: Board = {
      id, nome, descricao: template.descricao, fases: [],
      configuracoes: clone(template.configuracoes), criadoEm: agoraISO(), atualizadoEm: agoraISO(),
    }
    this.boards.set(id, board)
    template.fases.forEach((f) => {
      const fid = nanoid(10)
      this.fases.set(fid, { ...clone(f), id: fid, boardId: id })
    })
    return this.montarBoard(board)
  }

  async atualizarBoard(id: Id, patch: Partial<Pick<Board, 'nome' | 'descricao' | 'configuracoes'>>) {
    await dormir()
    const b = this.exigir(this.boards, id, 'Board')
    Object.assign(b, patch, { atualizadoEm: agoraISO() })
    return this.montarBoard(b)
  }

  // ---------- Fases ----------
  async criarFase(boardId: Id, fase: Omit<Fase, 'id' | 'boardId'>) {
    await dormir()
    const nova: Fase = { ...clone(fase), id: nanoid(10), boardId }
    this.fases.set(nova.id, nova)
    return clone(nova)
  }

  async atualizarFase(id: Id, patch: Partial<Omit<Fase, 'id' | 'boardId'>>) {
    await dormir()
    const f = this.exigir(this.fases, id, 'Fase')
    Object.assign(f, patch)
    return clone(f)
  }

  async reordenarFases(boardId: Id, idsEmOrdem: Id[]) {
    await dormir()
    idsEmOrdem.forEach((id, i) => { const f = this.fases.get(id); if (f && f.boardId === boardId) f.ordem = i })
    return this.fasesDoBoard(boardId)
  }

  async excluirFase(id: Id, destinoCardsId: Id | null) {
    await dormir()
    const orfaos = [...this.cards.values()].filter((c) => c.faseId === id)
    if (orfaos.length && !destinoCardsId) {
      throw new RepositoryError('Esta fase tem clientes. Escolha para onde eles vão antes de excluir.')
    }
    orfaos.forEach((c) => { c.faseId = destinoCardsId!; c.dataEntradaNaFase = agoraISO() })
    this.fases.delete(id)
  }

  // ---------- Cards ----------
  async listarCards(boardId: Id) {
    await dormir()
    return [...this.cards.values()].filter((c) => c.boardId === boardId).map(clone)
  }

  async obterCard(id: Id) { await dormir(80); const c = this.cards.get(id); return c ? clone(c) : null }

  async criarCard(dados: NovoCard) {
    await dormir()
    const board = this.exigir(this.boards, dados.boardId, 'Board')
    const fase = this.exigir(this.fases, dados.faseId, 'Fase')
    const entrada = dados.dataEntrada ?? hojeISO(board.configuracoes.fusoHorario)
    const card: Card = {
      id: nanoid(10),
      boardId: dados.boardId,
      codigo: this.proximoCodigo(),
      clienteNome: dados.clienteNome.trim(),
      clienteId: dados.clienteId,
      contatoPrincipal: dados.contatoPrincipal,
      segmento: dados.segmento,
      produtoPlano: dados.produtoPlano,
      responsavelId: dados.responsavelId,
      coResponsaveisIds: dados.coResponsaveisIds ?? [],
      dataEntrada: entrada,
      dataPrevistaSaida: dados.dataPrevistaSaida ?? somarDiasISO(entrada, board.configuracoes.duracaoCicloDias, board.configuracoes.fusoHorario),
      dataSaidaReal: dados.dataSaidaReal,
      faseId: dados.faseId,
      dataEntradaNaFase: dados.dataEntradaNaFase ?? agoraISO(),
      status: dados.status ?? 'ativo',
      resultadoFinal: dados.resultadoFinal,
      justificativaResultado: dados.justificativaResultado,
      prioridade: dados.prioridade ?? 'media',
      saude: dados.saude ?? 'verde',
      saudeManual: dados.saudeManual,
      tags: dados.tags ?? [],
      travadoManualmente: dados.travadoManualmente ?? false,
      checklist: dados.checklist ?? fase.checklistPadrao.map((texto) => ({ id: nanoid(8), texto, feito: false })),
      anexos: dados.anexos ?? [],
      camposCustomizados: dados.camposCustomizados ?? {},
      proximaAcao: dados.proximaAcao,
      criadoEm: agoraISO(),
      atualizadoEm: agoraISO(),
    }
    this.cards.set(card.id, card)
    this.registrarSistema(card.id, 'sistema', `Entrou em operação assistida em ${fase.nome}`, { faseId: fase.id })
    return clone(card)
  }

  async atualizarCard(id: Id, patch: PatchCard) {
    await dormir()
    const c = this.exigir(this.cards, id, 'Cliente')
    Object.assign(c, patch, { atualizadoEm: agoraISO() })
    return clone(c)
  }

  async excluirCard(id: Id) {
    await dormir()
    this.cards.delete(id)
    for (const [eid, e] of this.eventos) if (e.cardId === id) this.eventos.delete(eid)
  }

  // ---------- Histórico ----------
  async listarEventos(cardId: Id) {
    await dormir(100)
    return [...this.eventos.values()]
      .filter((e) => e.cardId === cardId)
      .sort((a, b) => b.dataHora.localeCompare(a.dataHora))
      .map(clone)
  }

  async listarEventosDoBoard(boardId: Id) {
    await dormir(120)
    const ids = new Set([...this.cards.values()].filter((c) => c.boardId === boardId).map((c) => c.id))
    return [...this.eventos.values()].filter((e) => ids.has(e.cardId)).map(clone)
  }

  async criarEvento(dados: NovoEvento) {
    await dormir()
    const e: Evento = { anexos: [], geradoPeloSistema: false, ...clone(dados), id: nanoid(10) }
    this.eventos.set(e.id, e)
    return clone(e)
  }

  async excluirEvento(id: Id) { await dormir(); this.eventos.delete(id) }

  // ---------- Templates ----------
  async listarTemplates() { await dormir(60); return clone(this.templates) }
  async salvarTemplate(t: Omit<TemplateBoard, 'id'>) {
    await dormir()
    const novo: TemplateBoard = { ...clone(t), id: nanoid(10) }
    this.templates.push(novo)
    return clone(novo)
  }
  async excluirTemplate(id: Id) { await dormir(); this.templates = this.templates.filter((t) => t.id !== id) }

  // ---------- Visões salvas ----------
  private visoes = new Map<Id, VisaoSalva>()
  async listarVisoes(boardId: Id) { await dormir(60); return [...this.visoes.values()].filter((v) => v.boardId === boardId).map(clone) }
  async salvarVisao(v: Omit<VisaoSalva, 'id' | 'criadoEm'>) {
    await dormir()
    const nova: VisaoSalva = { ...clone(v), id: nanoid(10), criadoEm: agoraISO() }
    this.visoes.set(nova.id, nova)
    return clone(nova)
  }
  async excluirVisao(id: Id) { await dormir(); this.visoes.delete(id) }

  // ---------- Integração ----------
  private integracoes = new Map<Id, ConfigIntegracao>()
  async obterConfigIntegracao(boardId: Id) { await dormir(60); return clone(this.integracoes.get(boardId) ?? CONFIG_INTEGRACAO_PADRAO(boardId)) }
  async salvarConfigIntegracao(config: ConfigIntegracao) { await dormir(); this.integracoes.set(config.boardId, clone(config)); return clone(config) }

  // ---------- internos ----------
  private exigir<T>(mapa: Map<Id, T>, id: Id, nome: string): T {
    const v = mapa.get(id)
    if (!v) throw new RepositoryError(`${nome} não encontrado.`)
    return v
  }

  private proximoCodigo() { this.seqCodigo += 1; return `OA-${String(this.seqCodigo).padStart(4, '0')}` }

  private fasesDoBoard(boardId: Id): Fase[] {
    return [...this.fases.values()].filter((f) => f.boardId === boardId).sort((a, b) => a.ordem - b.ordem).map(clone)
  }

  private montarBoard(b: Board): Board { return { ...clone(b), fases: this.fasesDoBoard(b.id) } }

  private registrarSistema(cardId: Id, tipo: Evento['tipo'], titulo: string, meta?: Record<string, unknown>) {
    const e: Evento = {
      id: nanoid(10), cardId, tipo, titulo, dataHora: agoraISO(), autorNome: 'Sistema',
      anexos: [], origem: 'manual', geradoPeloSistema: true, meta,
    }
    this.eventos.set(e.id, e)
  }

  /** Board semeado com as 6 fases e alguns clientes em pontos diferentes da esteira. */
  private semear() {
    const boardId = 'board-oa'
    const board: Board = {
      id: boardId, nome: 'Operação Assistida', descricao: 'Acompanhamento pós-implantação (30 dias).',
      fases: [], configuracoes: clone(CONFIG_PADRAO), criadoEm: agoraISO(), atualizadoEm: agoraISO(),
    }
    this.boards.set(boardId, board)
    const tpl = TEMPLATES_PADRAO[0]
    const faseIds = tpl.fases.map((f) => {
      const id = nanoid(10)
      this.fases.set(id, { ...clone(f), id, boardId })
      return id
    })

    const fuso = board.configuracoes.fusoHorario
    const hoje = hojeISO(fuso)
    const exemplos: Array<[string, number, number, string, Card['prioridade'], string[]]> = [
      // cliente, dias desde a entrada, índice da fase, responsável, prioridade, tags
      ['Clínica Vida Plena', 1, 0, 'u-ana', 'media', ['clínica']],
      ['Provedor NetSul', 5, 1, 'u-rafael', 'alta', ['provedor', 'omnichannel']],
      ['Auto Peças Ramos', 9, 2, 'u-ana', 'baixa', ['pabx']],
      ['Condomínio Solar', 13, 1, 'u-rafael', 'media', ['pabx']],      // fixado e atrás da esteira
      ['Escola Horizonte', 17, 3, 'u-ana', 'critica', ['call center']],
      ['Log Express', 33, 4, 'u-rafael', 'alta', ['discador']],         // passou dos 30 dias → aguardando finalização
      ['Farmácia Central', 27, 4, 'u-eduardo', 'media', ['omnichannel']],
      ['Hotel Mirante', 12, 1, 'u-ana', 'media', ['pabx']],             // atrás: o sistema avança sozinho ao carregar
    ]
    for (const [nome, dias, faseIdx, resp, prio, tags] of exemplos) {
      const entrada = somarDiasISO(hoje, -dias, fuso)
      const faseId = faseIds[faseIdx]
      const fase = this.fases.get(faseId)!
      const id = nanoid(10)
      const card: Card = {
        id, boardId, codigo: this.proximoCodigo(), clienteNome: nome,
        contatoPrincipal: { nome: 'Contato ' + nome.split(' ')[0], email: 'contato@exemplo.com' },
        segmento: tags[0], produtoPlano: 'Plataforma ERA',
        responsavelId: resp, coResponsaveisIds: [],
        dataEntrada: entrada, dataPrevistaSaida: somarDiasISO(entrada, 30, fuso),
        faseId, dataEntradaNaFase: somarDiasISO(hoje, -Math.min(dias, 3), fuso),
        status: 'ativo', prioridade: prio, saude: 'verde', tags,
        travadoManualmente: nome === 'Condomínio Solar',
        checklist: fase.checklistPadrao.map((texto, i) => ({ id: nanoid(8), texto, feito: i === 0 })),
        anexos: [], camposCustomizados: {},
        proximaAcao: faseIdx > 0 ? { descricao: 'Acionamento semanal', dataPrazo: somarDiasISO(hoje, (faseIdx % 3) - 1, fuso), responsavelId: resp } : undefined,
        criadoEm: entrada, atualizadoEm: agoraISO(),
      }
      this.cards.set(id, card)
      this.registrarSistema(id, 'sistema', `Entrou em operação assistida em ${tpl.fases[0].nome}`, { faseId: faseIds[0] })
      if (faseIdx > 0) this.registrarSistema(id, 'mudanca_de_fase', `Avançou para ${fase.nome}`, { paraFaseId: faseId })
      // Alguns acionamentos manuais de exemplo (com datas atrás da entrada)
      if (dias >= 3) {
        this.eventos.set(nanoid(10), {
          id: '', cardId: id, tipo: 'ligacao', titulo: 'Ligação de boas-vindas e alinhamento do plano', descricao: 'Confirmado o contato principal e o horário de uso da plataforma.',
          dataHora: somarDiasISO(entrada, 1, fuso).replace('T00:00', 'T10:30'), autorId: resp, autorNome: USUARIOS.find((u) => u.id === resp)?.nome,
          duracaoMin: 18, anexos: [], origem: 'manual', geradoPeloSistema: false,
        })
      }
      if (dias >= 8) {
        this.eventos.set(nanoid(10), {
          id: '', cardId: id, tipo: 'whatsapp', titulo: 'Dúvida sobre relatório de chamadas', descricao: 'Enviado o passo a passo do Registro de Chamadas.',
          dataHora: somarDiasISO(entrada, 6, fuso).replace('T00:00', 'T15:12'), autorId: resp, autorNome: USUARIOS.find((u) => u.id === resp)?.nome,
          anexos: [], origem: 'manual', geradoPeloSistema: false,
        })
      }
    }
    for (const [eid, e] of this.eventos) if (!e.id) e.id = eid
  }
}
