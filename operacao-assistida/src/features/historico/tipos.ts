import type { TipoEvento } from '@/domain/types'

export interface InfoTipo {
  icone: string
  rotulo: string
  /** Cor que codifica o tipo de acionamento (única cor nova além das fases). */
  cor: string
  temDuracao?: boolean
  temLink?: boolean
}

export const TIPOS_MANUAIS: TipoEvento[] = ['ligacao', 'whatsapp', 'email', 'reuniao', 'ticket', 'nota']

export const INFO_TIPO: Record<TipoEvento, InfoTipo> = {
  ligacao: { icone: '📞', rotulo: 'Ligação', cor: '#2F62B8', temDuracao: true },
  whatsapp: { icone: '💬', rotulo: 'WhatsApp', cor: '#1F8F6E' },
  email: { icone: '✉️', rotulo: 'E-mail', cor: '#447BBE' },
  reuniao: { icone: '🗓️', rotulo: 'Reunião', cor: '#6B5BD2', temDuracao: true },
  ticket: { icone: '🎫', rotulo: 'Ticket', cor: '#B8730D', temLink: true },
  nota: { icone: '📝', rotulo: 'Nota', cor: '#6A7186' },
  mudanca_de_fase: { icone: '⇄', rotulo: 'Mudança de fase', cor: '#6A7186' },
  sistema: { icone: '⚙️', rotulo: 'Sistema', cor: '#6A7186' },
}
