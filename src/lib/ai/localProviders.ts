import { AI_PATCH_JSON_SCHEMA } from "./diagramPatchJsonSchema";
import {
  LOCAL_AI_DEFAULT_URLS,
  type AiChatHistoryMessage,
  type AiModel,
  type LocalAiProviderId,
} from "./aiProviderTypes";

interface OllamaTagsResponse {
  models?: Array<{
    name?: unknown;
    details?: { family?: unknown; parameter_size?: unknown; quantization_level?: unknown };
  }>;
}

interface OpenAiModelsResponse {
  data?: Array<{ id?: unknown; owned_by?: unknown }>;
}

interface LocalErrorBody {
  error?: unknown;
  message?: unknown;
}

class LocalAiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function normalizeBaseUrl(provider: LocalAiProviderId, baseUrl: string): string {
  const value = baseUrl.trim().replace(/\/+$/u, "");
  if (!value) return LOCAL_AI_DEFAULT_URLS[provider];
  return value.replace(/(?:\/api|\/v1)$/u, "");
}

function localConnectionError(provider: LocalAiProviderId, baseUrl: string, error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      `${provider === "ollama" ? "Ollama" : "LM Studio"} could not be reached at ${baseUrl}. Check that its local server is running and browser access is enabled.`,
    );
  }
  return error instanceof Error ? error : new Error("Local AI request failed.");
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function getErrorText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = body as LocalErrorBody;
  if (typeof value.error === "string") return value.error;
  if (typeof value.message === "string") return value.message;
  if (value.error && typeof value.error === "object") {
    const nested = value.error as { message?: unknown };
    if (typeof nested.message === "string") return nested.message;
  }
  return null;
}

function modelNameFromId(id: string): string {
  const lastPart = id.split("/").at(-1) ?? id;
  return lastPart.replace(/[-_:]+/gu, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function listLocalAiModels(
  provider: LocalAiProviderId,
  baseUrl: string,
): Promise<AiModel[]> {
  const root = normalizeBaseUrl(provider, baseUrl);
  const url =
    provider === "ollama" ? `${root}/api/tags` : `${root}/v1/models`;
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await readJson(response);
    if (!response.ok) {
      throw new LocalAiHttpError(
        getErrorText(body) ?? `Local server returned HTTP ${response.status}.`,
        response.status,
      );
    }

    if (provider === "ollama") {
      const models = (body as OllamaTagsResponse).models ?? [];
      return models
        .filter((model): model is { name: string; details?: OllamaTagsResponse["models"][number]["details"] } => typeof model.name === "string")
        .map((model) => {
          const details = model.details;
          const suffix = [details?.family, details?.parameter_size, details?.quantization_level]
            .filter((part): part is string => typeof part === "string")
            .join(" · ");
          return {
            id: model.name,
            name: model.name,
            ...(suffix ? { description: suffix } : {}),
            contextLength: null,
            supportsResponseFormat: true,
            supportsStructuredOutputs: true,
          };
        });
    }

    return ((body as OpenAiModelsResponse).data ?? [])
      .filter((model): model is { id: string; owned_by?: unknown } => typeof model.id === "string")
      .map((model) => ({
        id: model.id,
        name: modelNameFromId(model.id),
        ...(typeof model.owned_by === "string" ? { description: model.owned_by } : {}),
        contextLength: null,
        supportsResponseFormat: true,
        supportsStructuredOutputs: true,
      }));
  } catch (error) {
    throw localConnectionError(provider, root, error);
  }
}

function buildMessages(
  systemInstruction: string,
  history: AiChatHistoryMessage[],
  userMessage: string,
) {
  return [
    { role: "system", content: systemInstruction },
    ...history.map((message) => ({
      role: message.role === "model" ? ("assistant" as const) : ("user" as const),
      content: message.text,
    })),
    { role: "user" as const, content: userMessage },
  ];
}

function getOpenAiResponseText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

async function callOllama(
  baseUrl: string,
  model: string,
  messages: ReturnType<typeof buildMessages>,
  useSchema = true,
): Promise<string> {
  const root = normalizeBaseUrl("ollama", baseUrl);
  const response = await fetch(`${root}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: useSchema ? AI_PATCH_JSON_SCHEMA : "json",
      options: { temperature: 0.2 },
    }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new LocalAiHttpError(
      getErrorText(body) ?? `Ollama returned HTTP ${response.status}.`,
      response.status,
    );
  }
  const content =
    body && typeof body === "object" &&
    (body as { message?: { content?: unknown } }).message &&
    typeof (body as { message: { content?: unknown } }).message.content === "string"
      ? (body as { message: { content: string } }).message.content.trim()
      : "";
  if (!content) throw new Error("Ollama returned an empty response.");
  return content;
}

async function callLmStudio(
  baseUrl: string,
  model: string,
  messages: ReturnType<typeof buildMessages>,
  useSchema = true,
): Promise<string> {
  const root = normalizeBaseUrl("lmstudio", baseUrl);
  const response = await fetch(`${root}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: false,
      ...(useSchema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "thoth_diagram_patch",
                strict: true,
                schema: AI_PATCH_JSON_SCHEMA,
              },
            },
          }
        : {}),
    }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new LocalAiHttpError(
      getErrorText(body) ?? `LM Studio returned HTTP ${response.status}.`,
      response.status,
    );
  }
  const content = getOpenAiResponseText(body);
  if (!content) throw new Error("LM Studio returned an empty response.");
  return content;
}

function shouldRetryWithoutSchema(error: unknown): boolean {
  return (
    error instanceof LocalAiHttpError &&
    error.status === 400 &&
    /format|schema|structured|json/iu.test(error.message)
  );
}

export async function callLocalDiagramAssistant(params: {
  provider: LocalAiProviderId;
  baseUrl: string;
  model: string;
  systemInstruction: string;
  history: AiChatHistoryMessage[];
  userMessage: string;
}): Promise<string> {
  if (!params.model) throw new Error("Choose a local model before sending a message.");
  const messages = buildMessages(
    params.systemInstruction,
    params.history,
    params.userMessage,
  );
  try {
    if (params.provider === "ollama") {
      try {
        return await callOllama(params.baseUrl, params.model, messages);
      } catch (error) {
        if (!shouldRetryWithoutSchema(error)) throw error;
        return callOllama(params.baseUrl, params.model, messages, false);
      }
    }
    try {
      return await callLmStudio(params.baseUrl, params.model, messages);
    } catch (error) {
      if (!shouldRetryWithoutSchema(error)) throw error;
      return callLmStudio(params.baseUrl, params.model, messages, false);
    }
  } catch (error) {
    throw localConnectionError(
      params.provider,
      normalizeBaseUrl(params.provider, params.baseUrl),
      error,
    );
  }
}
