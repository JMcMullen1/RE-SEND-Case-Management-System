import { z } from 'zod';

/**
 * In-process pub/sub for the case list's live channel. The list has one source
 * of truth: when a key date or a case changes, every connected client is told
 * to refetch. Key-date mutation paths (calendar, case screen, directions order)
 * call `broadcast` in later prompts; owner reassignment already does.
 */

export const RealtimeMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('caseChanged'), caseId: z.string() }),
  z.object({ type: z.literal('keyDatesChanged'), caseId: z.string() }),
]);
export type RealtimeMessage = z.infer<typeof RealtimeMessageSchema>;

interface Client {
  send: (data: string) => void;
}

const clients = new Set<Client>();

export function addClient(client: Client): () => void {
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcast(message: RealtimeMessage): void {
  const data = JSON.stringify(RealtimeMessageSchema.parse(message));
  for (const client of clients) {
    try {
      client.send(data);
    } catch {
      clients.delete(client);
    }
  }
}
