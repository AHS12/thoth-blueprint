import type { AiModel } from "./aiProviderTypes";

export type OpenRouterModel = AiModel & {
  supportsResponseFormat: boolean;
  supportsStructuredOutputs: boolean;
  promptPrice: string;
  completionPrice: string;
};

interface OpenRouterModelResponse {
  data?: Array<{
    id?: unknown;
    name?: unknown;
    description?: unknown;
    context_length?: unknown;
    supported_parameters?: unknown;
    pricing?: { prompt?: unknown; completion?: unknown };
  }>;
  total_count?: unknown;
}

type OpenRouterModelData = NonNullable<OpenRouterModelResponse["data"]>[number];

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CHAT_URL =
  "https://openrouter.ai/api/v1/chat/completions";

let cachedModels: OpenRouterModel[] | null = null;
let modelRequest: Promise<OpenRouterModel[]> | null = null;

function modelFromApi(
  model: OpenRouterModelData,
): OpenRouterModel | null {
  if (typeof model.id !== "string" || typeof model.name !== "string") {
    return null;
  }
  const parameters = Array.isArray(model.supported_parameters)
    ? model.supported_parameters.filter(
        (parameter): parameter is string => typeof parameter === "string",
      )
    : [];
  const pricing = model.pricing ?? {};
  return {
    id: model.id,
    name: model.name,
    ...(typeof model.description === "string"
      ? { description: model.description }
      : {}),
    contextLength:
      typeof model.context_length === "number" ? model.context_length : null,
    supportsResponseFormat: parameters.includes("response_format"),
    supportsStructuredOutputs: parameters.includes("structured_outputs"),
    promptPrice:
      typeof pricing.prompt === "string" ? pricing.prompt : "0",
    completionPrice:
      typeof pricing.completion === "string" ? pricing.completion : "0",
  };
}

export async function listOpenRouterModels(options?: {
  force?: boolean;
  apiKey?: string;
}): Promise<OpenRouterModel[]> {
  if (cachedModels && !options?.force) return cachedModels;
  if (modelRequest && !options?.force) return modelRequest;

  modelRequest = (async () => {
    const models: OpenRouterModel[] = [];
    const limit = 1000;
    let offset = 0;

    while (true) {
      const url = new URL(OPENROUTER_MODELS_URL);
      url.searchParams.set("output_modalities", "text");
      url.searchParams.set("sort", "most-popular");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));
      const headers: Record<string, string> = { Accept: "application/json" };
      if (options?.apiKey) {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Could not load OpenRouter models (${response.status}).`);
      }
      const body = (await response.json()) as OpenRouterModelResponse;
      const page = (body.data ?? [])
        .map(modelFromApi)
        .filter((model): model is OpenRouterModel => model !== null);
      models.push(...page);
      if (page.length < limit) break;
      offset += page.length;
    }

    cachedModels = models;
    return models;
  })();

  try {
    return await modelRequest;
  } finally {
    modelRequest = null;
  }
}

export function clearOpenRouterModelCache(): void {
  cachedModels = null;
}

function getErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function getMessageText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return null;
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.trim() || null;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((part): part is { text: string } => {
      return (
        !!part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      );
    })
    .map((part) => part.text)
    .join("")
    .trim();
  return text || null;
}

export async function callOpenRouterDiagramAssistant(params: {
  apiKey: string;
  model: string;
  supportsResponseFormat: boolean;
  systemInstruction: string;
  history: { role: "user" | "model"; text: string }[];
  userMessage: string;
}): Promise<string> {
  const messages = [
    { role: "system", content: params.systemInstruction },
    ...params.history.map((message) => ({
      role: message.role === "model" ? ("assistant" as const) : ("user" as const),
      content: message.text,
    })),
    { role: "user" as const, content: params.userMessage },
  ];
  const body: Record<string, unknown> = {
    model: params.model,
    messages,
    temperature: 0.2,
  };
  if (params.supportsResponseFormat) {
    body.response_format = { type: "json_object" };
    body.provider = { require_parameters: true };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": window.location.origin,
    "X-OpenRouter-Title": "ThothBlueprint",
  };
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const responseBody = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(
      getErrorMessage(responseBody) ??
        `OpenRouter request failed (${response.status}).`,
    );
  }
  const text = getMessageText(responseBody);
  if (!text) throw new Error("Empty response from OpenRouter.");
  return text;
}
