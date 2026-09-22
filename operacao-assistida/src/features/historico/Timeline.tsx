import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Evento, Usuario } from '@/domain/types'
import { noFuso } from '@/domain/datas'
import { INFO_TIPO } from './tipos'

interface Props {
  eventos: Evento[] | undefined
  carregando: boolean
  usuarios: Usuario[]
  fuso: string
  onExcluir: (evento: Evento) => void
}

function rotuloDia(iso: string, fuso: string) {
  const d = noFuso(iso, fuso)
  if (isToday(d)) return 'Hoje'
  if (isYesterday(d)) return 'Ontem'
  return format(d, "EEEE, d 'de' MMMM", { locale: ptBR })
}

/** Timeline do cliente: manuais em destaque, eventos do sistema compactos e apagados. */
export function Timeline({ eventos, carregando, usuarios, fuso, onExcluir }: Props) {
  const reduzir = useReducedMotion()
  if (carregando) return <div className="flex flex-col gap-2"><div className="skel h-14" /><div className="skel h-14" /><div className="skel h-9" /></div>
  if (!eventos || eventos.length === 0) {
    return <div className="text-[13px] text-muted border border-dashed border-line rounded-box p-5 text-center">Nenhum acionamento ainda. Registre o primeiro contato acima.</div>
  }

  const porDia = new Map<string, Evento[]>()
  for (const e of eventos) {
    const k = format(noFuso(e.dataHora, fuso), 'yyyy-MM-dd')
    porDia.set(k, [...(porDia.get(k) ?? []), e])
  }
  const nome = (e: Evento) => e.autorNome ?? usuarios.find((u) => u.id === e.autorId)?.nome ?? '—'

  return (
    <div className="relative pl-5">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-line" aria-hidden />
      {[...porDia.entries()].map(([dia, lista]) => (
        <section key={dia} className="mb-4">
          <h4 className="lbl mb-2 -ml-5 pl-5 relative"><span className="absolute left-[3px] top-[3px] w-[9px] h-[9px] rounded-full bg-line border-2 border-bg" aria-hidden />{rotuloDia(lista[0]!.dataHora, fuso)}</h4>
          <AnimatePresence initial={false}>
            {lista.map((e) => {
              const info = INFO_TIPO[e.tipo]
              const hora = format(noFuso(e.dataHora, fuso), 'HH:mm')
              if (e.geradoPeloSistema) {
                return (
                  <motion.div key={e.id} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }} className="relative flex items-center gap-2 text-[12px] text-muted py-1 pl-1">
                    <span className="absolute -left-[17px] top-[9px] w-[7px] h-[7px] rounded-full bg-muted/60" aria-hidden />
                    <span aria-hidden className="w-4 text-center">{info.icone}</span>
                    <span className="flex-1 truncate">{e.titulo}</span>
                    <span className="font-mono text-[10.5px] shrink-0">{hora} · {nome(e)}</span>
                  </motion.div>
                )
              }
              return (
                <motion.article
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: -6, backgroundColor: reduzir ? undefined : 'color-mix(in srgb, var(--beige) 70%, var(--card))' }}
                  animate={{ opacity: 1, y: 0, backgroundColor: 'var(--card)' }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: .25, backgroundColor: { duration: 1.6, delay: .3 } }}
                  className="group relative border border-line rounded-box p-3 mb-2 shadow-card"
                  style={{ borderLeft: `3px solid ${info.cor}` }}
                >
                  <span className="absolute -left-[18px] top-3.5 w-[9px] h-[9px] rounded-full border-2 border-bg" style={{ background: info.cor }} aria-hidden />
                  <div className="flex items-start gap-2">
                    <span aria-hidden className="text-[15px] leading-none mt-0.5">{info.icone}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[13.5px] text-navy leading-snug">{e.titulo}</div>
                      {e.descricao && <p className="text-[13px] text-ink mt-1 whitespace-pre-wrap leading-relaxed">{e.descricao}</p>}
                      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5 font-mono text-[10.5px] text-muted">
                        <span className="rounded-badge px-1.5 py-[2px] text-white" style={{ background: info.cor }}>{info.rotulo}</span>
                        <span>{hora}</span>
                        <span>{nome(e)}</span>
                        {e.duracaoMin != null && <span>{e.duracaoMin} min</span>}
                        {e.origem === 'integracao' && <span title="Importado da integração">⇅ integração</span>}
                        {e.linkExterno && <a className="text-accent2 underline underline-offset-2" href={e.linkExterno} target="_blank" rel="noreferrer">abrir ↗</a>}
                      </div>
                      {e.anexos.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          {e.anexos.map((a) => (
                            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-badge bg-soft2 px-1.5 py-1 font-mono text-[11px] text-navy hover:bg-card2">📎 {a.nome}</a>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted hover:text-red text-[12px] shrink-0 transition-opacity" onClick={() => onExcluir(e)} aria-label="Excluir registro" title="Excluir">✕</button>
                  </div>
                </motion.article>
              )
            })}
          </AnimatePresence>
        </section>
      ))}
    </div>
  )
}
