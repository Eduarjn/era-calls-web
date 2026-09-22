/**
 * Toda a aritmética de datas do módulo passa por aqui.
 * Nunca some milissegundos na mão: use date-fns + @date-fns/tz.
 */
import { addDays, differenceInCalendarDays, startOfDay, parseISO, formatISO } from 'date-fns'
import { TZDate } from '@date-fns/tz'

export const FUSO_PADRAO = 'America/Sao_Paulo'

/** Agora no fuso do board. */
export function agora(fuso: string = FUSO_PADRAO): TZDate {
  return TZDate.tz(fuso)
}

/** Converte ISO em data no fuso informado. */
export function noFuso(iso: string, fuso: string = FUSO_PADRAO): TZDate {
  return new TZDate(parseISO(iso), fuso)
}

/** Início do dia (00:00) no fuso, como ISO. */
export function inicioDoDiaISO(iso: string, fuso: string = FUSO_PADRAO): string {
  return formatISO(startOfDay(noFuso(iso, fuso)))
}

/** Hoje às 00:00 no fuso, como ISO. */
export function hojeISO(fuso: string = FUSO_PADRAO): string {
  return formatISO(startOfDay(agora(fuso)))
}

export function somarDiasISO(iso: string, dias: number, fuso: string = FUSO_PADRAO): string {
  return formatISO(addDays(noFuso(iso, fuso), dias))
}

/** Dias de calendário entre duas datas no fuso (b - a). */
export function diasEntre(aISO: string, bISO: string, fuso: string = FUSO_PADRAO): number {
  return differenceInCalendarDays(noFuso(bISO, fuso), noFuso(aISO, fuso))
}

/** Dias decorridos desde `iso` até hoje (no fuso). Nunca negativo. */
export function diasDecorridos(iso: string, hoje: string = hojeISO(), fuso: string = FUSO_PADRAO): number {
  return Math.max(0, diasEntre(iso, hoje, fuso))
}
