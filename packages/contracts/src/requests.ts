import { z } from 'zod';
import { ChatMessageSchema } from './chat';

const LanguageSchema = z.string().min(2).max(10);

export const SummaryRequestSchema = z.object({
  language: LanguageSchema.default('en'),
});

export const GreetingRequestSchema = z.object({
  // The browser's local wall-clock time (HH:MM, 24h), used to pick "Good morning/afternoon/evening".
  localTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24h)')
    .optional(),
  language: LanguageSchema.optional(),
});

export const ChatModeSchema = z.enum(['talk', 'teach']);

export const ChatRequestSchema = z.object({
  mode: ChatModeSchema,
  messages: z
    .array(ChatMessageSchema)
    .min(1)
    .max(20)
    .refine((messages) => messages.at(-1)?.role === 'user', { message: 'The last message must be from the user' }),
});

export const HelpRequestSchema = z.object({
  question: z.string().trim().min(3).max(500),
  messages: z.array(ChatMessageSchema).max(10).optional(),
});

export type SummaryRequest = z.infer<typeof SummaryRequestSchema>;
export type GreetingRequest = z.infer<typeof GreetingRequestSchema>;
export type ChatMode = z.infer<typeof ChatModeSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type HelpRequest = z.infer<typeof HelpRequestSchema>;
