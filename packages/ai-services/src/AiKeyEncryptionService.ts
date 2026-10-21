import { AgentClient } from '@qozara/ai-client';

export class AiKeyEncryptionService {
  /**
   * Encrypts a user's personal Gemini/provider API key using the edge KMS proxy.
   * Returns a secure ciphertext string to store safely in local or cloud storage.
   */
  static async encryptApiKey(apiKey: string, proxyUrl: string): Promise<string> {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      throw new Error('API key cannot be empty');
    }
    const cleanUrl = (proxyUrl || '').trim().replace(/\/+$/, '');
    if (!cleanUrl) {
      throw new Error('AI proxy URL is required to encrypt API key');
    }

    const client = new AgentClient(cleanUrl);
    return await client.encryptApiKey(trimmedKey);
  }
}
