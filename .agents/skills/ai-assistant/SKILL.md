---
name: ai-assistant
description: Safely change the schema AI assistant, cloud or local providers, credentials, context construction, streamed patches, retries, validation, or atomic diagram application. Use for AI chat and provider work.
---

# AI Assistant

## Read First

- `src/components/AiChatTab.tsx` and `src/components/AiProvidersDialog.tsx` for UI behavior.
- `src/lib/ai/buildDiagramContext.ts` for context scope and truncation.
- `src/lib/ai/diagramAssistantInstruction.ts` for the model contract.
- `src/lib/ai/diagramPatchSchema.ts` and `src/lib/ai/diagramPatchJsonSchema.ts` for the patch contract.
- `src/lib/ai/simulateAiPatch.ts` and `src/store/store.ts` for validation and commit behavior.
- `src/lib/ai/aiCredentialStorage.ts` for credential handling.

## Change Rules

1. Preserve the pipeline: provider request -> streamed response -> parse -> Zod validation -> simulation on a clone -> atomic store commit.
2. Never apply raw model output or a partially simulated patch. Return an actionable error and leave the current diagram unchanged on failure.
3. Resolve references with the existing ID/name rules and handle duplicate names deliberately.
4. Preserve locked diagram and locked zone protections in both direct store actions and AI simulation.
5. Keep cloud and local providers distinct. Cloud providers receive diagram context; Ollama and LM Studio are intended for local keyless use and may require local CORS configuration.
6. Never log API keys, decrypted credentials, session secrets, or full schema context. Avoid expanding context beyond what the user selected or the feature requires.
7. Preserve retry and cancellation behavior for transient provider failures without duplicating a committed patch.

## Verification

- Test valid patches, malformed JSON, schema-invalid operations, simulation failures, duplicate references, locked diagrams, and streamed/retried responses.
- Verify provider setup does not expose secrets in logs or UI errors.
- Confirm chat history remains scoped to the selected diagram and persists after reload.
- Run the standard type-check, lint, and production build gate.
