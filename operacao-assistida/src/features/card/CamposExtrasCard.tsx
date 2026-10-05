import { useEffect, useState } from 'react'
import type { Card, PatchCard, Usuario } from '@/domain/types'
import { CHAVE_COR, CHAVE_RESPONSAVEL_NOME, comCampo, corDoCard, responsavelDigitado } from '@/domain/cardExtras'
import {
  ehTip, integracaoDoCard, integracaoQual, ROTULO_INTEGRACAO, setIntegracao, setIntegracaoQual,
  setTip, setVendedor, vendedorDoCard, VENDEDORES_INTERNOS, type Integracao,
} from '@/domain/comercial'
import { CORES_CARD } from '@/domain/seed'

const OUTRO = '__outro'

/**
 * Responsável: usuário da plataforma ou um nome digitado (para quem não tem login na Inteligência de Calls).
 * Escolher um usuário limpa o nome digitado e vice-versa.
 */
export function SeletorResponsavel({ card, usuarios, onPatch }: { card: Card; usuarios: Usuario[]; onPatch: (p: PatchCard) => void }) {
  const digitado = responsavelDigitado(card)
  const [outro, setOutro] = useState(!card.responsavelId && !!digitado)
  useEffect(() => { setOutro(!card.responsavelId && !!responsavelDigitado(card)) }, [card.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const valor = card.responsavelId ?? (outro ? OUTRO : '')
  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={valor}
        onChange={(e) => {
          const v = e.target.value
          if (v === OUTRO) { setOutro(true); if (card.responsavelId) onPatch({ responsavelId: undefined }); return }
          setOutro(false)
          onPatch({ responsavelId: v || undefined, camposCustomizados: comCampo(card, CHAVE_RESPONSAVEL_NOME, undefined) })
        }}
      >
        <option value="">Sem responsável</option>
        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        <option value={OUTRO}>✎ Outro (digitar nome)…</option>
      </select>
      {outro && (
        <input
          key={'rn' + card.id}
          autoFocus={!digitado}
          defaultValue={digitado ?? ''}
          placeholder="Nome do responsável"
          onBlur={(e) => { if (e.target.value.trim() !== (digitado ?? '')) onPatch({ camposCustomizados: comCampo(card, CHAVE_RESPONSAVEL_NOME, e.target.value) }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
      )}
      {usuarios.length <= 1 && !outro && (
        <span className="text-[11.5px] text-muted">Aqui só aparecem os usuários com login na plataforma. Para outra pessoa, use “Outro”.</span>
      )}
    </div>
  )
}

/** Cor de destaque do card (borda e fundo no kanban). */
export function SeletorCorCard({ card, onPatch }: { card: Card; onPatch: (p: PatchCard) => void }) {
  const atual = corDoCard(card)
  const escolher = (cor: string | undefined) => onPatch({ camposCustomizados: comCampo(card, CHAVE_COR, cor) })
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Cor do card">
      <button
        type="button" role="radio" aria-checked={!atual} title="Sem cor (usa a cor da fase)"
        onClick={() => escolher(undefined)}
        className={`w-7 h-7 rounded-full border grid place-items-center text-[12px] text-muted ${!atual ? 'border-navy ring-2 ring-navy/40' : 'border-line hover:border-navy'}`}
      >∅</button>
      {CORES_CARD.map(({ nome, cor }) => (
        <button
          key={cor} type="button" role="radio" aria-checked={atual === cor} title={nome} aria-label={nome}
          onClick={() => escolher(cor)}
          className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${atual === cor ? 'border-white ring-2 scale-110' : 'border-transparent'}`}
          style={{ background: cor, ...(atual === cor ? { boxShadow: `0 0 0 2px ${cor}` } : {}) }}
        />
      ))}
    </div>
  )
}

/**
 * Bloco comercial do card: vendedor interno, origem TIP e integração.
 * Preenchimento manual — é o que o time olha na reunião de acompanhamento.
 */
export function BlocoComercial({ card, onPatch }: { card: Card; onPatch: (p: PatchCard) => void }) {
  const vendedor = vendedorDoCard(card)
  const integracao = integracaoDoCard(card)
  const qual = integracaoQual(card)
  // Vendedor que veio de outra fonte (ex.: importação) e não está na lista de internos.
  const fora = vendedor && !VENDEDORES_INTERNOS.includes(vendedor) ? vendedor : undefined

  return (
    <div className="rounded-box border border-line bg-soft3 p-3.5 flex flex-col gap-3">
      <div className="lbl">Comercial</div>
      <div className="grid grid-cols-1 @min-[400px]:grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="lbl block mb-1.5">Vendedor interno</span>
          <select value={vendedor ?? ''} onChange={(e) => onPatch({ camposCustomizados: setVendedor(card, e.target.value || undefined) })}>
            <option value="">— não informado —</option>
            {VENDEDORES_INTERNOS.map((v) => <option key={v} value={v}>{v}</option>)}
            {fora && <option value={fora}>{fora}</option>}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="lbl block mb-1.5">Integração</span>
          <select value={integracao ?? ''} onChange={(e) => onPatch({ camposCustomizados: setIntegracao(card, (e.target.value || undefined) as Integracao | undefined) })}>
            <option value="">— não informado —</option>
            {(Object.keys(ROTULO_INTEGRACAO) as Integracao[]).map((i) => <option key={i} value={i}>{ROTULO_INTEGRACAO[i]}</option>)}
          </select>
        </label>
        {integracao === 'sim' && (
          <label className="block min-w-0 @min-[400px]:col-span-2">
            <span className="lbl block mb-1.5">Qual integração</span>
            <input
              key={'iq' + card.id} defaultValue={qual ?? ''} placeholder="CRM, ERP, API própria…"
              onBlur={(e) => { if (e.target.value.trim() !== (qual ?? '')) onPatch({ camposCustomizados: setIntegracaoQual(card, e.target.value) }) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
          </label>
        )}
      </div>
      <label className="flex items-center gap-2 text-[13px] cursor-pointer">
        <input type="checkbox" className="!w-auto" checked={ehTip(card)} onChange={(e) => onPatch({ camposCustomizados: setTip(card, e.target.checked) })} />
        Cliente da TIP (veio pelo parceiro)
      </label>
    </div>
  )
}
