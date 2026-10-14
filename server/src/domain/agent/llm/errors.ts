import { AppError } from '../../../lib/errors.js';

/**
 * Provider-neutral LLM failures with stable codes. Messages are fixed sentences, so neither the
 * provider's own wording nor any workbook content can reach the client, the database or a webhook.
 */
export class LLMRefusalError extends AppError {
  constructor(
    readonly provider: string,
    readonly model: string,
  ) {
    super(502, 'LLM_REFUSED', 'The language model declined to process this request.');
  }
}

export class LLMTimeoutError extends AppError {
  constructor() {
    super(504, 'LLM_TIMEOUT', 'The language model did not respond in time.');
  }
}

export class LLMError extends AppError {
  constructor(message: string) {
    super(502, 'LLM_ERROR', message);
  }
}
