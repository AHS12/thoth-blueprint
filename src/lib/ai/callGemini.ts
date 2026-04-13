import { GoogleGenAI } from "@google/genai";

/** Default model for diagram patches; override if a model id stops working. */
export const GEMINI_DIAGRAM_MODEL = "gemini-2.5-flash";

export async function callGeminiDiagramAssistant(params: {
  apiKey: string;
  systemInstruction: string;
  history: { role: "user" | "model"; text: string }[];
  userMessage: string;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const contents = [
    ...params.history.map((p) => ({
      role: p.role,
      parts: [{ text: p.text }],
    })),
    { role: "user" as const, parts: [{ text: params.userMessage }] },
  ];

  const response = await ai.models.generateContent({
    model: GEMINI_DIAGRAM_MODEL,
    contents,
    config: {
      systemInstruction: params.systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text?.trim()) {
    throw new Error("Empty response from model.");
  }
  return text.trim();
}
