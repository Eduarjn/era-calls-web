import { supabase } from '@/lib/supabase'
import type {
  Board, Card, Evento, Fase, Id, NovoCard, NovoEvento, PatchCard, TemplateBoard, Usuario, VisaoSalva,
} from '@/domain/types'
import { CONFIG_PADRAO, TEMPLATES_PADRAO } from '@/domain/seed'
import { hojeISO, somarDiasISO } from '@/domain/datas'
import { CONFIG_INTEGRACAO_PADRAO, type ConfigIntegracao } from '@/integrations/types'
import { RepositoryError, type Repository } from './repository'

type Linha = Record<string, unknown>
const agoraISO = () => new Date().toISOString()

function falhar(msg: string, erro: unknown): never {
  console.error('[operacao-assistida]', msg, erro)
  throw new RepositoryError(msg, erro)
}

// ---------- mapeamento snake_case ↔ camelCase ----------
const paraFase = (r: Linha): Fase => ({
  id: r.id as string, boardId: r.board_id as string, nome: r.nome as string, ordem: r.ordem as number, cor: r.cor as string,
  tipo: r.tipo as Fase['tipo'], duracaoDias: r.duracao_dias as number, regraAutoAvanco: r.regra_auto_avanco as Fase['regraAutoAvanco'],
  limiteWIP: (r.limite_wip as number | null) ?? undefined, checklistPadrao: (r.checklist_padrao as string[]) ?? [], arquivada: !!r.arquivada,
})
const deFase = (f: Partial<Omit<Fase, 'id' | 'boardId'>>): Linha => {
  const o: Linha = {}
  if (f.nome !== undefined) o.nome = f.nome
  if (f.ordem !== undefined) o.ordem = f.ordem
  if (f.cor !== undefined) o.cor = f.cor
  if (f.tipo !== undefined) o.tipo = f.tipo
  if (f.duracaoDias !== undefined) o.duracao_dias = f.duracaoDias
  if (f.regraAutoAvanco !== undefined) o.regra_auto_avanco = f.regraAutoAvanco
  if ('limiteWIP' in f) o.limite_wip = f.limiteWIP ?? null
  if (f.checklistPadrao !== undefined) o.checklist_padrao = f.checklistPadrao
  if (f.arquivada !== undefined) o.arquivada = f.arquivada
  return o
}

const paraCard = (r: Linha): Card => ({
  id: r.id as string, boardId: r.board_id as string, codigo: r.codigo as string, clienteNome: r.cliente_nome as string,
  clienteId: (r.cliente_id as string | null) ?? undefined, contatoPrincipal: (r.contato_principal as Card['contatoPrincipal'] | null) ?? undefined,
  segmento: (r.segmento as string | null) ?? undefined, produtoPlano: (r.produto_plano as string | null) ?? undefined,
  responsavelId: (r.responsavel_id as string | null) ?? undefined, coResponsaveisIds: (r.co_responsaveis_ids as string[]) ?? [],
  dataEntrada: r.data_entrada as string, dataPrevistaSaida: r.data_prevista_saida as string, dataSaidaReal: (r.data_saida_real as string | null) ?? undefined,
  faseId: r.fase_id as string, dataEntradaNaFase: r.data_entrada_na_fase as string,
  status: r.status as Card['status'], resultadoFinal: (r.resultado_final as Card['resultadoFinal'] | null) ?? undefined,
  justificativaResultado: (r.justificativa_resultado as string | null) ?? undefined,
  prioridade: r.prioridade as Card['prioridade'], saude: r.saude as Card['saude'], saudeManual: (r.saude_manual as Card['saude'] | null) ?? undefined,
  tags: (r.tags as string[]) ?? [], travadoManualmente: !!r.travado_manualmente,
  checklist: (r.checklist as Card['checklist']) ?? [], anexos: (r.anexos as Card['anexos']) ?? [],
  camposCustomizados: (r.campos_customizados as Card['camposCustomizados']) ?? {}, proximaAcao: (r.proxima_acao as Card['proximaAcao'] | null) ?? undefined,
  criadoEm: r.criado_em as string, atualizadoEm: r.atualizado_em as string,
})
const CAMPOS_CARD: Record<string, string> = {
  clienteNome: 'cliente_nome', clienteId: 'cliente_id', contatoPrincipal: 'contato_principal', segmento: 'segmento', produtoPlano: 'produto_plano',
  responsavelId: 'responsavel_id', coResponsaveisIds: 'co_responsaveis_ids', dataEntrada: 'data_entrada', dataPrevistaSaida: 'data_prevista_saida',
  dataSaidaReal: 'data_saida_real', faseId: 'fase_id', dataEntradaNaFase: 'data_entrada_na_fase', status: 'status', resultadoFinal: 'resultado_final',
  justificativaResultado: 'justificativa_resultado', prioridade: 'prioridade', saude: 'saude', saudeManual: 'saude_manual', tags: 'tags',
  travadoManualmente: 'travado_manualmente', checklist: 'checklist', anexos: 'anexos', camposCustomizados: 'campos_customizados', proximaAcao: 'proxima_acao',
}
const deCard = (p: PatchCard): Linha => {
  const o: Linha = {}
  for (const [k, v] of Object.entries(p)) { const col = CAMPOS_CARD[k]; if (col) o[col] = v === undefined ? null : v }
  return o
}

const paraEvento = (r: Linha): Evento => ({
  id: r.id as string, cardId: r.card_id as string, tipo: r.tipo as Evento['tipo'], titulo: r.titulo as string,
  descricao: (r.descricao as string | null) ?? undefined, dataHora: r.data_hora as string,
  autorId: (r.autor_id as string | null) ?? undefined, autorNome: (r.autor_nome as string | null) ?? undefined,
  duracaoMin: (r.duracao_min as number | null) ?? undefined, anexos: (r.anexos as Evento['anexos']) ?? [],
  linkExterno: (r.link_externo as string | null) ?? undefined, origem: r.origem as Evento['origem'],
  geradoPeloSistema: !!r.gerado_pelo_sistema, meta: (r.meta as Evento['meta'] | null) ?? undefined,
})

const paraBoard = (r: Linha, fases: Fase[]): Board => ({
  id: r.id as string, nome: r.nome as string, descricao: (r.descricao as string | null) ?? undefined,
  fases, configuracoes: { ...CONFIG_PADRAO, ...(r.configuracoes as Board['configuracoes']) },
  criadoEm: r.criado_em as string, atualizadoEm: r.atualizado_em as string,
})

/**
 * Persistência real no Supabase (tabelas oa_*, RLS por empresa).
 * Todas as escritas passam pelo RLS: quem está logado só vê e mexe na própria empresa.
 */
export class SupabaseRepository implements Repository {
  /** true se as tabelas oa_* existem no projeto. */
  static async disponivel(): Promise<boolean> {
    const { error } = await supabase.from('oa_boards').select('id').limit(1)
    return !error
  }

  // ---------- Usuários ----------
  async listarUsuarios(): Promise<Usuario[]> {
    const { data, error } = await supabase.from('perfis').select('id, nome, email, papel').order('nome')
    if (error) falhar('Não deu para carregar os usuários.', error)
    return (data ?? []).map((p) => ({ id: p.id, nome: p.nome ?? p.email ?? '—', email: p.email ?? '', papel: p.papel ?? undefined }))
  }
  async usuarioAtual(): Promise<Usuario | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase.from('perfis').select('id, nome, email, papel').eq('id', user.id).maybeSingle()
    return data ? { id: data.id, nome: data.nome ?? data.email ?? '—', email: data.email ?? '', papel: data.papel ?? undefined } : { id: user.id, nome: user.email ?? '—', email: user.email ?? '' }
  }

  // ---------- Boards ----------
  private async fasesDe(boardId: Id): Promise<Fase[]> {
    const { data, error } = await supabase.from('oa_fases').select('*').eq('board_id', boardId).order('ordem')
    if (error) falhar('Não deu para carregar as fases.', error)
    return (data ?? []).map(paraFase)
  }
  async listarBoards(): Promise<Board[]> {
    const { data, error } = await supabase.from('oa_boards').select('*').order('criado_em')
    if (error) falhar('Não deu para carregar os quadros.', error)
    if (!data?.length) {
      // Primeiro acesso da empresa: semeia o board padrão com as 6 fases.
      const b = await this.criarBoard('Operação Assistida', TEMPLATES_PADRAO[0]!)
      return [b]
    }
    return Promise.all(data.map(async (r) => paraBoard(r, await this.fasesDe(r.id))))
  }
  async obterBoard(id: Id): Promise<Board | null> {
    const { data, error } = await supabase.from('oa_boards').select('*').eq('id', id).maybeSingle()
    if (error) falhar('Não deu para carregar o quadro.', error)
    return data ? paraBoard(data, await this.fasesDe(id)) : null
  }
  async criarBoard(nome: string, template: TemplateBoard): Promise<Board> {
    const { data, error } = await supabase.from('oa_boards').insert({ nome, descricao: template.descricao ?? null, configuracoes: template.configuracoes }).select('*').single()
    if (error || !data) falhar('Não deu para criar o quadro.', error)
    const linhas = template.fases.map((f) => ({ board_id: data.id, ...deFase(f) }))
    const { error: e2 } = await supabase.from('oa_fases').insert(linhas)
    if (e2) falhar('Não deu para criar as fases do quadro.', e2)
    return paraBoard(data, await this.fasesDe(data.id))
  }
  async atualizarBoard(id: Id, patch: Partial<Pick<Board, 'nome' | 'descricao' | 'configuracoes'>>): Promise<Board> {
    const { data, error } = await supabase.from('oa_boards').update({ ...(patch.nome !== undefined && { nome: patch.nome }), ...(patch.descricao !== undefined && { descricao: patch.descricao }), ...(patch.configuracoes && { configuracoes: patch.configuracoes }) }).eq('id', id).select('*').single()
    if (error || !data) falhar('Não deu para salvar o quadro.', error)
    return paraBoard(data, await this.fasesDe(id))
  }

  // ---------- Fases ----------
  async criarFase(boardId: Id, fase: Omit<Fase, 'id' | 'boardId'>): Promise<Fase> {
    const { data, error } = await supabase.from('oa_fases').insert({ board_id: boardId, ...deFase(fase) }).select('*').single()
    if (error || !data) falhar('Não deu para criar a fase.', error)
    return paraFase(data)
  }
  async atualizarFase(id: Id, patch: Partial<Omit<Fase, 'id' | 'boardId'>>): Promise<Fase> {
    const { data, error } = await supabase.from('oa_fases').update(deFase(patch)).eq('id', id).select('*').single()
    if (error || !data) falhar('Não deu para salvar a fase.', error)
    return paraFase(data)
  }
  async reordenarFases(boardId: Id, idsEmOrdem: Id[]): Promise<Fase[]> {
    await Promise.all(idsEmOrdem.map((id, i) => supabase.from('oa_fases').update({ ordem: i }).eq('id', id)))
    return this.fasesDe(boardId)
  }
  async excluirFase(id: Id, destinoCardsId: Id | null): Promise<void> {
    const { count } = await supabase.from('oa_cards').select('id', { count: 'exact', head: true }).eq('fase_id', id)
    if ((count ?? 0) > 0) {
      if (!destinoCardsId) throw new RepositoryError('Esta fase tem clientes. Escolha para onde eles vão antes de excluir.')
      const { error } = await supabase.from('oa_cards').update({ fase_id: destinoCardsId, data_entrada_na_fase: agoraISO() }).eq('fase_id', id)
      if (error) falhar('Não deu para mover os clientes da fase.', error)
    }
    const { error } = await supabase.from('oa_fases').delete().eq('id', id)
    if (error) falhar('Não deu para excluir a fase.', error)
  }

  // ---------- Cards ----------
  async listarCards(boardId: Id): Promise<Card[]> {
    const { data, error } = await supabase.from('oa_cards').select('*').eq('board_id', boardId).order('criado_em')
    if (error) falhar('Não deu para carregar os clientes.', error)
    return (data ?? []).map(paraCard)
  }
  async obterCard(id: Id): Promise<Card | null> {
    const { data, error } = await supabase.from('oa_cards').select('*').eq('id', id).maybeSingle()
    if (error) falhar('Não deu para carregar o cliente.', error)
    return data ? paraCard(data) : null
  }
  async criarCard(dados: NovoCard): Promise<Card> {
    const board = await this.obterBoard(dados.boardId)
    if (!board) throw new RepositoryError('Quadro não encontrado.')
    const fase = board.fases.find((f) => f.id === dados.faseId)
    if (!fase) throw new RepositoryError('Fase não encontrada.')
    const fuso = board.configuracoes.fusoHorario
    const entrada = dados.dataEntrada ?? hojeISO(fuso)
    const { clienteNome, faseId, boardId, ...resto } = dados
    const linha: Linha = {
      board_id: boardId, cliente_nome: clienteNome.trim(), fase_id: faseId,
      data_entrada: entrada, data_prevista_saida: dados.dataPrevistaSaida ?? somarDiasISO(entrada, board.configuracoes.duracaoCicloDias, fuso),
      data_entrada_na_fase: dados.dataEntradaNaFase ?? agoraISO(),
      checklist: dados.checklist ?? fase.checklistPadrao.map((texto, i) => ({ id: `${Date.now()}-${i}`, texto, feito: false })),
      ...deCard(resto),
    }
    const { data, error } = await supabase.from('oa_cards').insert(linha).select('*').single()
    if (error || !data) falhar('Não deu para criar o cliente.', error)
    const card = paraCard(data)
    await this.criarEvento({ cardId: card.id, tipo: 'sistema', titulo: `Entrou em operação assistida em ${fase.nome}`, dataHora: agoraISO(), autorNome: 'Sistema', origem: 'manual', geradoPeloSistema: true, meta: { faseId: fase.id } })
    return card
  }
  async atualizarCard(id: Id, patch: PatchCard): Promise<Card> {
    const { data, error } = await supabase.from('oa_cards').update(deCard(patch)).eq('id', id).select('*').single()
    if (error || !data) falhar('Não deu para salvar o cliente.', error)
    return paraCard(data)
  }
  async excluirCard(id: Id): Promise<void> {
    const { error } = await supabase.from('oa_cards').delete().eq('id', id)
    if (error) falhar('Não deu para excluir o cliente.', error)
  }

  // ---------- Histórico ----------
  async listarEventos(cardId: Id): Promise<Evento[]> {
    const { data, error } = await supabase.from('oa_eventos').select('*').eq('card_id', cardId).order('data_hora', { ascending: false })
    if (error) falhar('Não deu para carregar o histórico.', error)
    return (data ?? []).map(paraEvento)
  }
  async listarEventosDoBoard(boardId: Id): Promise<Evento[]> {
    const { data, error } = await supabase.from('oa_eventos').select('*, oa_cards!inner(board_id)').eq('oa_cards.board_id', boardId)
    if (error) falhar('Não deu para carregar os acionamentos do quadro.', error)
    return (data ?? []).map(paraEvento)
  }
  async criarEvento(dados: NovoEvento): Promise<Evento> {
    const { data, error } = await supabase.from('oa_eventos').insert({
      card_id: dados.cardId, tipo: dados.tipo, titulo: dados.titulo, descricao: dados.descricao ?? null, data_hora: dados.dataHora,
      autor_id: dados.autorId ?? null, autor_nome: dados.autorNome ?? null, duracao_min: dados.duracaoMin ?? null, anexos: dados.anexos ?? [],
      link_externo: dados.linkExterno ?? null, origem: dados.origem, gerado_pelo_sistema: dados.geradoPeloSistema ?? false, meta: dados.meta ?? null,
      chave_externa: dados.meta?.ticketId ? `${dados.origem}:${dados.meta.ticketId}` : null,
    }).select('*').single()
    if (error || !data) falhar('Não deu para registrar o acionamento.', error)
    return paraEvento(data)
  }
  async excluirEvento(id: Id): Promise<void> {
    const { error } = await supabase.from('oa_eventos').delete().eq('id', id)
    if (error) falhar('Não deu para excluir o registro.', error)
  }

  // ---------- Templates ----------
  async listarTemplates(): Promise<TemplateBoard[]> {
    const { data, error } = await supabase.from('oa_templates').select('*').order('criado_em')
    if (error) falhar('Não deu para carregar os templates.', error)
    const proprios = (data ?? []).map((r) => ({ id: r.id, nome: r.nome, descricao: r.descricao ?? undefined, configuracoes: r.configuracoes, fases: r.fases }))
    return [...TEMPLATES_PADRAO, ...proprios]
  }
  async salvarTemplate(t: Omit<TemplateBoard, 'id'>): Promise<TemplateBoard> {
    const { data, error } = await supabase.from('oa_templates').insert({ nome: t.nome, descricao: t.descricao ?? null, configuracoes: t.configuracoes, fases: t.fases }).select('*').single()
    if (error || !data) falhar('Não deu para salvar o template.', error)
    return { id: data.id, nome: data.nome, descricao: data.descricao ?? undefined, configuracoes: data.configuracoes, fases: data.fases }
  }
  async excluirTemplate(id: Id): Promise<void> { await supabase.from('oa_templates').delete().eq('id', id) }

  // ---------- Visões salvas ----------
  async listarVisoes(boardId: Id): Promise<VisaoSalva[]> {
    const { data, error } = await supabase.from('oa_visoes').select('*').eq('board_id', boardId).order('criado_em')
    if (error) falhar('Não deu para carregar as visões salvas.', error)
    return (data ?? []).map((r) => ({ id: r.id, boardId: r.board_id, nome: r.nome, visao: r.visao, filtros: r.filtros, criadoEm: r.criado_em }))
  }
  async salvarVisao(v: Omit<VisaoSalva, 'id' | 'criadoEm'>): Promise<VisaoSalva> {
    const { data, error } = await supabase.from('oa_visoes').insert({ board_id: v.boardId, nome: v.nome, visao: v.visao, filtros: v.filtros }).select('*').single()
    if (error || !data) falhar('Não deu para salvar a visão.', error)
    return { id: data.id, boardId: data.board_id, nome: data.nome, visao: data.visao, filtros: data.filtros, criadoEm: data.criado_em }
  }
  async excluirVisao(id: Id): Promise<void> { await supabase.from('oa_visoes').delete().eq('id', id) }

  // ---------- Integração ----------
  async obterConfigIntegracao(boardId: Id): Promise<ConfigIntegracao> {
    const { data } = await supabase.from('oa_integracoes').select('*').eq('board_id', boardId).maybeSingle()
    if (!data) return CONFIG_INTEGRACAO_PADRAO(boardId)
    return { boardId, provider: data.provider, ativa: data.ativa, urlBase: data.url_base, mapeamento: data.mapeamento ?? {}, agendamentoMin: data.agendamento_min, ultimaSync: data.ultima_sync ?? undefined, ultimoErro: data.ultimo_erro ?? undefined }
  }
  async salvarConfigIntegracao(c: ConfigIntegracao): Promise<ConfigIntegracao> {
    const { error } = await supabase.from('oa_integracoes').upsert({ board_id: c.boardId, provider: c.provider, ativa: c.ativa, url_base: c.urlBase, mapeamento: c.mapeamento, agendamento_min: c.agendamentoMin, ultima_sync: c.ultimaSync ?? null, ultimo_erro: c.ultimoErro ?? null })
    if (error) falhar('Não deu para salvar a integração.', error)
    return c
  }
}
