import type { Repository } from './repository'
import { MockRepository } from './mockRepository'
import { SupabaseRepository } from './supabaseRepository'

/**
 * Ponto único de troca da persistência.
 * - Produção: Supabase (tabelas oa_*), se a migration `supabase/oa_schema.sql` já rodou no projeto.
 * - Sem as tabelas (ou em dev sem VITE_OA_REPO=supabase): mock em memória com dados de exemplo.
 * A escolha acontece uma vez em `inicializarRepository()` (App), antes de qualquer tela usar dados.
 */
let instancia: Repository | null = null
let modo: 'mock' | 'supabase' = 'mock'

export async function inicializarRepository(): Promise<'mock' | 'supabase'> {
  const forcarMock = import.meta.env.DEV && import.meta.env.VITE_OA_REPO !== 'supabase'
  if (!forcarMock && (await SupabaseRepository.disponivel())) {
    instancia = new SupabaseRepository(); modo = 'supabase'
  } else {
    instancia = new MockRepository(); modo = 'mock'
  }
  return modo
}

export function getRepository(): Repository {
  if (!instancia) { instancia = new MockRepository(); modo = 'mock' }
  return instancia
}

export function modoRepository() { return modo }

export type { Repository } from './repository'
export { RepositoryError } from './repository'
