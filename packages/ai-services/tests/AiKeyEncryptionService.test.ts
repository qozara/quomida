import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiKeyEncryptionService } from '../src/AiKeyEncryptionService.js';
import { AgentClient } from '@qozara/ai-client';

describe('AiKeyEncryptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws an error if apiKey is empty', async () => {
    await expect(
      AiKeyEncryptionService.encryptApiKey('  ', 'https://proxy.example.com')
    ).rejects.toThrow('API key cannot be empty');
  });

  it('throws an error if proxyUrl is empty', async () => {
    await expect(
      AiKeyEncryptionService.encryptApiKey('AIzaSyValidKey', '')
    ).rejects.toThrow('AI proxy URL is required');
  });

  it('delegates to AgentClient to encrypt key and returns ciphertext', async () => {
    const mockEncrypt = vi.spyOn(AgentClient.prototype, 'encryptApiKey').mockResolvedValue('encrypted:aes-gcm:cipher123');

    const result = await AiKeyEncryptionService.encryptApiKey(
      'AIzaSyTestKey',
      'https://proxy.example.com/api/'
    );

    expect(result).toBe('encrypted:aes-gcm:cipher123');
    expect(mockEncrypt).toHaveBeenCalledWith('AIzaSyTestKey');
  });
});
