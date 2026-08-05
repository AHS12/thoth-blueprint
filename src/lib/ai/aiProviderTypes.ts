export interface AiModel {
  id: string;
  name: string;
  description?: string;
  contextLength: number | null;
  supportsResponseFormat?: boolean;
  supportsStructuredOutputs?: boolean;
  promptPrice?: string;
  completionPrice?: string;
}

export type AiChatHistoryMessage = {
  role: "user" | "model";
  text: string;
};

export type LocalAiProviderId = "ollama" | "lmstudio";

export const LOCAL_AI_DEFAULT_URLS: Record<LocalAiProviderId, string> = {
  ollama: "http://localhost:11434",
  lmstudio: "http://localhost:1234",
};
