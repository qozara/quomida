import type { AiProviderType } from '@quomida/domain-core';

export const AI_CONFIG = {
  proxyUrl: (import.meta.env.VITE_AI_PROXY_URL || '').replace(/\/+$/, ''),
  defaultProvider: ((import.meta.env.VITE_DEFAULT_AI_PROVIDER as string) || 'qozara-intelligence') as AiProviderType,
  defaultOllamaBaseUrl: (import.meta.env.VITE_DEFAULT_OLLAMA_BASE_URL as string) || 'http://localhost:11434/api',
  defaultOllamaModel: (import.meta.env.VITE_DEFAULT_OLLAMA_MODEL as string) || 'llama3.2',
} as const;
