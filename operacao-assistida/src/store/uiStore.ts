import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { FILTROS_VAZIOS, type Filtros, type Visao } from '@/domain/types'

export interface Toast {
  id: string
  mensagem: string
  acao?: { rotulo: string; executar: () => void }
  /** ms até sumir. */
  duracao: number
}

interface UIState {
  visao: Visao
  setVisao: (v: Visao) => void

  boardAtivoId: string | null
  setBoardAtivo: (id: string | null) => void

  telaConfig: 'fases' | 'importar' | 'integracao' | null
  abrirConfig: (t: 'fases' | 'importar' | 'integracao' | null) => void

  filtros: Filtros
  setFiltros: (f: Partial<Filtros>) => void
  limparFiltros: () => void

  selecionados: string[]
  setSelecionados: (ids: string[]) => void

  cardAbertoId: string | null
  abrirCard: (id: string | null) => void

  quickAddFaseId: string | null
  abrirQuickAdd: (faseId: string | null) => void

  finalizandoCardId: string | null
  abrirDesfecho: (id: string | null) => void

  mostrarFinalizados: boolean
  alternarFinalizados: () => void

  colunasColapsadas: Record<string, boolean>
  alternarColuna: (faseId: string) => void

  toasts: Toast[]
  notificar: (t: Omit<Toast, 'id' | 'duracao'> & { duracao?: number }) => string
  fecharToast: (id: string) => void
}

/** Estado de UI. Só preferências de tela vão para o localStorage — nunca dado de negócio. */
export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      visao: 'kanban',
      setVisao: (visao) => set({ visao }),

      boardAtivoId: null,
      setBoardAtivo: (boardAtivoId) => set({ boardAtivoId, selecionados: [], cardAbertoId: null }),

      telaConfig: null,
      abrirConfig: (telaConfig) => set({ telaConfig }),

      filtros: FILTROS_VAZIOS,
      setFiltros: (f) => set((s) => ({ filtros: { ...s.filtros, ...f } })),
      limparFiltros: () => set({ filtros: FILTROS_VAZIOS }),

      selecionados: [],
      setSelecionados: (selecionados) => set({ selecionados }),

      cardAbertoId: null,
      abrirCard: (id) => set({ cardAbertoId: id }),

      quickAddFaseId: null,
      abrirQuickAdd: (faseId) => set({ quickAddFaseId: faseId }),

      finalizandoCardId: null,
      abrirDesfecho: (id) => set({ finalizandoCardId: id }),

      mostrarFinalizados: false,
      alternarFinalizados: () => set((s) => ({ mostrarFinalizados: !s.mostrarFinalizados })),

      colunasColapsadas: {},
      alternarColuna: (faseId) =>
        set((s) => ({ colunasColapsadas: { ...s.colunasColapsadas, [faseId]: !s.colunasColapsadas[faseId] } })),

      toasts: [],
      notificar: (t) => {
        const id = Math.random().toString(36).slice(2)
        const toast: Toast = { duracao: 6000, ...t, id }
        set((s) => ({ toasts: [...s.toasts.slice(-2), toast] }))
        setTimeout(() => get().fecharToast(id), toast.duracao)
        return id
      },
      fecharToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
    }),
    {
      name: 'oa-ui',
      // Só preferências de tela: última visão, colunas recolhidas, mostrar finalizados.
      partialize: (s) => ({ visao: s.visao, boardAtivoId: s.boardAtivoId, colunasColapsadas: s.colunasColapsadas, mostrarFinalizados: s.mostrarFinalizados }),
    },
  ),
)
