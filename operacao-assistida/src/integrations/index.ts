import { MockProvider } from './mockProvider'
import { MovideskProvider } from './movideskProvider'
import type { ConfigIntegracao, IntegrationProvider } from './types'

const mock = new MockProvider()

/** Escolhe o provider pela configuração do board. A UI nunca instancia providers diretamente. */
export function getProvider(config: ConfigIntegracao): IntegrationProvider {
  if (config.provider === 'movidesk') return new MovideskProvider(config)
  return mock
}

export * from './types'
