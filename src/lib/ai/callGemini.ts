import { GoogleGenAI } from "@google/genai";

/** Default model for diagram patches; override if a model id stops working. */
export const GEMINI_DIAGRAM_MODEL = "gemini-flash-latest";

export async function callGeminiDiagramAssistant(params: {
  apiKey: string;
  model?: string;
  systemInstruction: string;
  history: { role: "user" | "model"; text: string }[];
  userMessage: string;
  onText?: (text: string) => void;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const contents = [
    ...params.history.map((p) => ({
      role: p.role,
      parts: [{ text: p.text }],
    })),
    { role: "user" as const, parts: [{ text: params.userMessage }] },
  ];

  const config = {
    systemInstruction: params.systemInstruction,
    responseMimeType: "application/json",
    temperature: 0.2,
  };
  let text = "";
  if (params.onText) {
    const stream = await ai.models.generateContentStream({
      model: params.model ?? GEMINI_DIAGRAM_MODEL,
      contents,
      config,
    });
    for await (const chunk of stream) {
      const next = chunk.text ?? "";
      if (!next) continue;
      text += next;
      params.onText(next);
    }
  } else {
    const response = await ai.models.generateContent({
      model: params.model ?? GEMINI_DIAGRAM_MODEL,
      contents,
      config,
    });
    text = response.text ?? "";
  }
  if (!text?.trim()) {
    throw new Error("Empty response from model.");
  }
  return text.trim();
}
