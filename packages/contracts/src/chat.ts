import { z } from 'zod';

// Only user/assistant: clients can never inject a system turn.
export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
