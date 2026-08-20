import { z } from 'zod';

/**
 * Validação de entrada das rotas. Antes era `req.body as any` em tudo —
 * um `module` inválido só aparecia lá na frente, como CLAUDE.md faltando.
 */
export const MODULES = ['smartweb', 'atende', 'agenda', 'mwsus', 'cadgf'] as const;

const CardImageSchema = z.object({
  name: z.string(),
  mediaType: z.string(),
  data: z.string(),
});

const CardTraceFileSchema = z.object({
  name: z.string(),
  content: z.string(),
});

const TraceProviderSchema = z.object({
  modelAi: z.string().min(1),
  apiKey: z.string().min(1),
  azureEndpoint: z.string().optional(),
});

export const CreateCardSchema = z.object({
  jiraKey: z.string().min(1, 'jiraKey é obrigatório'),
  module: z.enum(MODULES),
  rawTicket: z.string().min(1, 'rawTicket é obrigatório'),
  images: z.array(CardImageSchema).max(6).optional(),
  traceFiles: z.array(CardTraceFileSchema).max(3).optional(),
  traceProvider: TraceProviderSchema.optional(),
});

export const ResolveCardSchema = z.object({
  note: z.string().optional(),
  resolutionText: z.string().optional(),
});

export const RejectCardSchema = z.object({
  note: z.string().optional(),
});

export const RetryCardSchema = z.object({
  traceProvider: TraceProviderSchema.nullish(),
});

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const CreateUserSchema = z.object({
  username: z.string().min(3).regex(/^[a-z0-9._-]+$/i, 'use letras, números, ponto, hífen ou _'),
  displayName: z.string().min(1),
  password: z.string().min(8, 'senha precisa de ao menos 8 caracteres'),
  isAdmin: z.boolean().optional(),
});

export const UpdateMeSchema = z.object({
  displayName: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
  jiraUser: z.string().optional(),
  jiraPassword: z.string().optional(),
});

export const UpdateSettingsSchema = z.object({
  anthropicApiKey: z.string().optional(),
  model: z.string().optional(),
  aiProvider: z.enum(['anthropic', 'openai']).optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  traceServiceUrl: z.string().url().optional(),
  jiraBaseUrl: z.string().url().optional(),
  jiraAssignedJql: z.string().optional(),
  pbInsightUrl: z.string().url().optional(),
});

/** Erro de validação com mensagem legível em vez de dump do Zod. */
export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'corpo'}: ${i.message}`).join('; ');
}
