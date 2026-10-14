import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z, type ZodType } from 'zod';

// Routes register their contract here next to the handler, so docs cannot drift from validation.
export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().meta({ example: 'VALIDATION_ERROR' }),
      message: z.string(),
      details: z.unknown().nullable(),
      requestId: z.string(),
    }),
  })
  .meta({ id: 'Error' });

/** Wraps a payload schema in the standard `{ data, meta }` envelope. */
export function envelope(data: ZodType, meta: ZodType = z.object({})) {
  return z.object({ data, meta });
}

export const json = (schema: ZodType, description = 'Success') => ({
  description,
  content: { 'application/json': { schema } },
});

const errorDescriptions: Record<number, string> = {
  400: 'Bad request',
  401: 'Missing or invalid access token',
  403: 'Insufficient role or not the owner',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  422: 'Validation failed',
  429: 'Rate limit exceeded',
};

/** Standard error responses for a route, keyed by status code. */
export function errors(...codes: number[]) {
  return Object.fromEntries(codes.map((c) => [c, json(ErrorSchema, errorDescriptions[c] ?? 'Error')]));
}

export const bearer = [{ bearerAuth: [] }];

export function generateOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'FinAgent API',
      version: '1.0.0',
      description:
        'Upload Excel/CSV workbooks, run deterministic analysis with an LLM-written summary, and export reports. ' +
        'Successful responses use `{ data, meta }`; errors use `{ error: { code, message, details, requestId } }`.',
    },
    servers: [{ url: '/' }],
  });
}
