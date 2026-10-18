export type AiErrorCode =
  | 'RATE_LIMIT_EXCEEDED'
  | 'AI_DISABLED'
  | 'NO_ITEMS_PARSED'
  | 'NETWORK_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'PARSE_FAILED';

export class AiMealError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AiMealError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function classifyAiError(err: unknown): AiMealError {
  if (err instanceof AiMealError) {
    return err;
  }

  const msg = err instanceof Error ? err.message : String(err);

  if (/RATE_LIMIT|quota|Too Many Requests|429/i.test(msg)) {
    return new AiMealError('RATE_LIMIT_EXCEEDED', msg, err);
  }
  if (/AI is disabled/i.test(msg)) {
    return new AiMealError('AI_DISABLED', msg, err);
  }
  if (/No food items|Could not extract/i.test(msg)) {
    return new AiMealError('NO_ITEMS_PARSED', msg, err);
  }
  if (/Failed to fetch|Network error|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    return new AiMealError('NETWORK_ERROR', msg, err);
  }
  if (/Unauthorized|401|403|Forbidden/i.test(msg)) {
    return new AiMealError('AUTHENTICATION_REQUIRED', msg, err);
  }

  return new AiMealError('PARSE_FAILED', msg, err);
}
