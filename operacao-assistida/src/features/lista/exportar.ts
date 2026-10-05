import type { Card, Fase, Usuario } from '@/domain/types'
import type { Derivados } from '@/features/kanban/CardKanban'
import { corDoCard, nomeResponsavel } from '@/domain/cardExtras'
import { ehTip, integracaoDoCard, integracaoQual, vendedorDoCard } from '@/domain/comercial'

export interface LinhaExport { [coluna: string]: string | number }

export function linhasParaExportar(cards: Card[], fases: Fase[], usuarios: Usuario[], derivados: Map<string, Derivados>): LinhaExport[] {
  const fase = (id: string) => fases.find((f) => f.id === id)?.nome ?? ''
  return cards.map((c) => ({
    Código: c.codigo, Cliente: c.clienteNome, Fase: fase(c.faseId), Status: c.status,
    Responsável: nomeResponsavel(c, usuarios) ?? '', Prioridade: c.prioridade, Saúde: derivados.get(c.id)?.saude ?? c.saude,
    Entrada: c.dataEntrada.slice(0, 10), 'Saída prevista': c.dataPrevistaSaida.slice(0, 10), 'Saída real': c.dataSaidaReal?.slice(0, 10) ?? '',
    Resultado: c.resultadoFinal ?? '', 'Próxima ação': c.proximaAcao?.descricao ?? '', 'Prazo da ação': c.proximaAcao?.dataPrazo.slice(0, 10) ?? '',
    Segmento: c.segmento ?? '', 'Produto/plano': c.produtoPlano ?? '', Contato: c.contatoPrincipal?.nome ?? '', 'E-mail': c.contatoPrincipal?.email ?? '',
    Vendedor: vendedorDoCard(c) ?? '', TIP: ehTip(c) ? 'Sim' : '',
    'Integração': integracaoDoCard(c) === 'sim' ? 'Sim' : integracaoDoCard(c) === 'nao' ? 'Não' : '',
    'Qual integração': integracaoQual(c) ?? '',
    Tags: c.tags.join(', '), Cor: corDoCard(c) ?? '', 'Id externo': c.clienteId ?? '',
  }))
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** CSV com ; (padrão Excel pt-BR) e BOM para acentos. */
export function exportarCSV(linhas: LinhaExport[], nome = 'operacao-assistida.csv') {
  if (!linhas.length) return
  const cols = Object.keys(linhas[0]!)
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [cols.join(';'), ...linhas.map((l) => cols.map((c) => esc(l[c]!)).join(';'))].join('\r\n')
  baixar(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), nome)
}

/** XLSX carregado sob demanda (SheetJS) para não pesar o bundle. */
export async function exportarXLSX(linhas: LinhaExport[], nome = 'operacao-assistida.xlsx') {
  if (!linhas.length) return
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(linhas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
  const dados = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  baixar(new Blob([dados], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nome)
}
