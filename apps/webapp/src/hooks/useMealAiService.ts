import { useCallback, useMemo } from 'react';
import {
  BatchMealResolver,
  CatalogSearchManager,
  MealService,
  type IRecipeDecomposer,
  type UserSettings
} from '@quomida/domain-core';
import { LlmRecipeDecomposer, isGenAiEnabled } from '@quomida/ai-services';
import { AI_CONFIG } from '../config/ai.js';

export function extractGoogleOAuthToken(userSettings?: Partial<UserSettings> | null): string | null {
  const creds = (userSettings as any)?.active_cloud_provider?.credentials;
  if (typeof creds === 'string' && creds.trim()) {
    return creds.trim();
  }
  const token = creds?.accessToken || creds?.access_token || creds?.token;
  if (typeof token === 'string' && token.trim()) {
    return token.trim();
  }
  return null;
}

export interface UseMealAiServiceOptions {
  userSettings?: Partial<UserSettings> | null;
  searchManager?: CatalogSearchManager;
  batchResolver?: BatchMealResolver;
  decomposerOverride?: IRecipeDecomposer | null;
}

/**
 * Reusable hook composing Quomida's deterministic MealService with optional
 * GenAI recipe/ingredient escalation wired from @quomida/ai-services.
 */
export function useMealAiService(options: UseMealAiServiceOptions = {}) {
  const { userSettings, searchManager, batchResolver, decomposerOverride } = options;

  const genAiEnabled = useMemo(
    () => isGenAiEnabled(userSettings?.ai_settings),
    [userSettings?.ai_settings]
  );

  const getAuthToken = useCallback(
    async (): Promise<string | null> => extractGoogleOAuthToken(userSettings),
    [userSettings]
  );

  const decomposer = useMemo<IRecipeDecomposer | undefined>(() => {
    if (decomposerOverride) {
      return decomposerOverride;
    }
    if (!genAiEnabled) {
      return undefined;
    }
    const aiSettings = userSettings?.ai_settings;
    const provider = aiSettings?.provider || AI_CONFIG.defaultProvider;
    const enableLocalAi = Boolean(
      aiSettings?.enable_local_ai || provider === 'ollama' || provider === 'local'
    );

    return new LlmRecipeDecomposer({
      proxyUrl: AI_CONFIG.proxyUrl,
      provider,
      ciphertext: aiSettings?.ciphertext,
      ollamaBaseUrl: aiSettings?.ollama_base_url || AI_CONFIG.defaultOllamaBaseUrl,
      ollamaModel: aiSettings?.ollama_model || AI_CONFIG.defaultOllamaModel,
      enableLocalAi,
      getAuthToken
    });
  }, [decomposerOverride, genAiEnabled, userSettings?.ai_settings, getAuthToken]);

  const createMealService = useCallback(
    () =>
      new MealService({
        decomposer,
        searchManager,
        batchResolver
      }),
    [decomposer, searchManager, batchResolver]
  );

  return {
    isGenAiEnabled: genAiEnabled,
    decomposer,
    createMealService
  };
}
