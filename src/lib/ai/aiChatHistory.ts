import { db } from "@/lib/db";
import type { AiChatMessage } from "@/lib/types";

export async function loadAiChatHistory(
  diagramId: number,
): Promise<AiChatMessage[]> {
  const row = await db.aiChatSessions.get(diagramId);
  return row?.messages ?? [];
}

export async function saveAiChatHistory(
  diagramId: number,
  messages: AiChatMessage[],
): Promise<void> {
  await db.aiChatSessions.put({
    diagramId,
    messages,
    updatedAt: Date.now(),
  });
}
