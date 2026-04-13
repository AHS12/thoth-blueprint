import {
  loadAiChatHistory,
  saveAiChatHistory,
} from "@/lib/ai/aiChatHistory";
import {
  buildDiagramContext,
  diagramContextToPromptJson,
} from "@/lib/ai/buildDiagramContext";
import {
  callGeminiDiagramAssistant,
  GEMINI_DIAGRAM_MODEL,
} from "@/lib/ai/callGemini";
import {
  hasEncryptedGeminiKey,
  loadGeminiKeyFromSession,
} from "@/lib/ai/geminiEncryptedStorage";
import type { AiChatMessage } from "@/lib/types";
import { useStore } from "@/store/store";
import { showError, showSuccess } from "@/utils/toast";
import { cn } from "@/lib/utils";
import {
  Bot,
  Loader2,
  Lock,
  SendHorizontal,
  Settings2,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useShallow } from "zustand/react/shallow";
import { GeminiKeyModal } from "./GeminiKeyModal";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";

const SYSTEM_INSTRUCTION = `You are the in-app schema copilot for **ThothBlueprint**: a visual ER diagram editor (tables, columns, relationships). Behave like a senior DB designer: clear naming, sensible keys, normalization when it helps, and pragmatic tradeoffs users can maintain.

## Mental model
- You emit a JSON **patch**, not raw DDL. The app validates and applies updates **atomically** (every operation succeeds or none are applied).
- Relationships connect **two columns**; their **type** strings must match as stored after normalization.
- **Out of scope for this API** (mention in **summary** only): SQL indexes, check constraints, triggers, views, notes/zones on the canvas, data migration scripts. Users can add indexes in the table UI or export SQL elsewhere.

## Reading: Current diagram (JSON)
Each user message ends with a JSON snapshot—parse it every time.

| Field | How to use it |
|-------|----------------|
| **dbType** | "mysql" or "postgres" — every column **type** must be valid for that engine. SQL-style types OK: VARCHAR(255), DECIMAL(10,2), INT UNSIGNED. |
| **editorFocus** | Plain-language hint for selection; use to disambiguate ("add a column" → selected table). |
| **aiChatTarget** | When non-null, the user pinned one or more tables (context menu). Primary targets are **primaryTableIds** / **primaryLabels**; **associatedTableIds** are diagram neighbors outside that set—co-update when FKs, types, renames, or cardinality must stay aligned across the subgraph. |
| **selectedNodeId** / **selectedEdgeId** | Canvas selection ids (may be null). |
| **tables[]** | Non-deleted tables: **id** (node id), **label**, **columns** with **id**, **name**, **type**, **pk**, **nullable**. |
| **relationships[]** | Edges: **id**, endpoints, **relationship** cardinality. |

**Greenfield (tables is [])**: output **create_table** for each entity first, then **create_relationship**. Runtime assigns table node ids—you may reference new tables by **label** and columns by **name** in the same **operations** array; the resolver maps them.

**Existing data**: prefer **tables[].id** and **columns[].id** from JSON for edits to avoid stale labels.

## Response format (strict)
One top-level JSON object only—no markdown code fences, no leading/trailing prose.

{ "summary": "…", "operations": [ … ] }

- **summary**: Always substantive—what changed, design rationale, assumptions, risks, or next steps. Use short markdown (bullets, **bold**). If **operations** is [], **summary** carries the full answer.
- **operations**: Ordered steps. On doubt or unsupported requests, use **operations**: [] and explain in **summary**.

## Capability catalog (five operations)

**1) create_table** — Add a table.
{ "op":"create_table", "label":"snake_case_name", "columns":[ ColumnInput, … ], "position"?:{ "x": number, "y": number } }
- **label**: unique (case-insensitive). Prefer consistent plural entity names (**users**, **blog_posts**).
- **columns**: at least one; include a PK (**pk**: true, **nullable**: false) unless you document why not in **summary**.

**2) update_table** — Change a table.
{ "op":"update_table", "tableId":"<tables[].id OR label>", "label"?, "columns"?, "comment"?|null }
- **columns** if present = **full replacement** list: every surviving column must appear with its **id** preserved; new columns omit **id**.
- Table rename: **label**. Comment only: omit **columns**; clear comment with **comment**: null.

**3) delete_table** — Remove a table.
{ "op":"delete_table", "tableId":"<id OR label>" }
- Edges to that table are stripped; you may still **delete_relationship** first for clarity.

**4) create_relationship** — Edge between two columns.
{ "op":"create_relationship", "sourceTableId","sourceColumnId","targetTableId","targetColumnId","relationshipType":"one-to-one"|"one-to-many"|"many-to-one"|"many-to-many" }
- Tables: **id** or **label** (including tables created earlier in this **operations** array).
- Columns: **id** or **name** on that table.
- **relationshipType**: match the business (FK usually on the "many" side). No duplicate edge for the same column pair.

**5) delete_relationship** — Remove an edge.
{ "op":"delete_relationship", "edgeId":"<relationships[].id>" }

## ColumnInput
{ "id"?, "name", "type", "pk"?, "nullable"?, "length"?, "precision"?, "scale"?, "comment"?, "isUnsigned"?, "isAutoIncrement"?, "isUnique"?, "defaultValue"?, "enumValues"? }

**ThothBlueprint-friendly patterns**
- **Naming**: snake_case; FKs often **user_id**-style names referencing the parent table's PK column.
- **Surrogate PKs**: BIGINT / UUID / SERIAL family per dbType; align FK types to referenced PKs.
- **Junction / M–M**: separate table + FK columns + two relationships to parents.
- **Timestamps**: **created_at**, **updated_at** with appropriate **DATETIME** / **TIMESTAMPTZ** and **nullable** false where system-managed.

## dbType hints
- **mysql**: INT, BIGINT, VARCHAR, TEXT, DATETIME, TIMESTAMP, JSON, ENUM, DECIMAL, etc.
- **postgres**: UUID, TEXT, VARCHAR, BOOLEAN, JSONB, TIMESTAMPTZ, SERIAL/BIGSERIAL, ARRAY when justified.

## Operation order (discipline)
1. create_table (new entities)  
2. update_table (mutations)  
3. create_relationship (endpoints must exist in the running draft)  
4. delete_relationship → delete_table for teardowns  

## Pre-flight checklist
- Full column list on every **update_table** that sends **columns**?
- Every **create_relationship** references tables/columns that exist or were created above?
- FK column **type** pairs match?
- No duplicate relationship for the same two columns?

## When operations must be []
- Questions, reviews, comparisons, or "how should I…?" with no edit.
- Diagram **locked** (tell user to unlock).
- Needs unsupported features—explain alternatives in **summary**.`;

function parseModelJson(text: string): unknown {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/u, "")
      .trim();
  }
  return JSON.parse(t) as unknown;
}

function AiChatThinkingIndicator() {
  return (
    <div
      className="flex flex-row gap-2.5"
      aria-busy="true"
      aria-live="polite"
      aria-label="Assistant is thinking"
    >
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full bg-primary/15 animate-ping"
          style={{ animationDuration: "2s" }}
        />
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted text-primary ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div
        className={cn(
          "max-w-[min(100%,20rem)] rounded-2xl rounded-tl-md border border-primary/15 px-3.5 py-2.5 shadow-sm",
          "bg-gradient-to-r from-muted/70 via-primary/[0.12] to-muted/70 bg-[length:400%_100%] animate-ai-chat-shimmer",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">Thinking about your schema</p>
          <span className="flex items-center gap-1 pt-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-ai-thinking-dot"
                style={{ animationDelay: `${i * 140}ms` }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AiChatTab({ isLocked }: { isLocked: boolean }) {
  const apiKeyRef = useRef<string | null>(null);
  const chatScrollEndRef = useRef<HTMLDivElement>(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [sessionUnlocked, setSessionUnlocked] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [storedKeyPresent, setStoredKeyPresent] = useState(() =>
    hasEncryptedGeminiKey(),
  );

  useEffect(() => {
    const k = loadGeminiKeyFromSession();
    if (k) {
      apiKeyRef.current = k;
      setSessionUnlocked(true);
    }
  }, []);

  const {
    diagram,
    selectedNodeId,
    selectedEdgeId,
    aiChatPinnedTableIds,
    removeAiChatPinnedTable,
    setAiChatPinnedTableIds,
    applyAiDiagramOperations,
  } = useStore(
    useShallow((s) => {
      const d = s.selectedDiagramId
        ? s.diagramsMap.get(s.selectedDiagramId)
        : undefined;
      return {
        diagram: d,
        selectedNodeId: s.selectedNodeId,
        selectedEdgeId: s.selectedEdgeId,
        aiChatPinnedTableIds: s.aiChatPinnedTableIds,
        removeAiChatPinnedTable: s.removeAiChatPinnedTable,
        setAiChatPinnedTableIds: s.setAiChatPinnedTableIds,
        applyAiDiagramOperations: s.applyAiDiagramOperations,
      };
    }),
  );

  const pinnedTablesForChips = useMemo(() => {
    if (!diagram?.data.nodes?.length || !aiChatPinnedTableIds.length) return [];
    const byId = new Map(diagram.data.nodes.map((n) => [n.id, n]));
    const out: { id: string; label: string }[] = [];
    for (const id of aiChatPinnedTableIds) {
      const n = byId.get(id);
      if (n?.type === "table" && !n.data.isDeleted) {
        out.push({ id, label: n.data.label });
      }
    }
    return out;
  }, [diagram, aiChatPinnedTableIds]);

  useEffect(() => {
    if (!diagram?.data.nodes || aiChatPinnedTableIds.length === 0) return;
    const valid = new Set(
      diagram.data.nodes
        .filter((n) => n.type === "table" && !n.data.isDeleted)
        .map((n) => n.id),
    );
    const next = aiChatPinnedTableIds.filter((id) => valid.has(id));
    if (next.length !== aiChatPinnedTableIds.length) {
      setAiChatPinnedTableIds(next);
    }
  }, [diagram, aiChatPinnedTableIds, setAiChatPinnedTableIds]);

  const diagramId = diagram?.id;

  useEffect(() => {
    setChatHydrated(false);
    if (diagramId == null) {
      setMessages([]);
      setChatHydrated(true);
      return;
    }
    let cancelled = false;
    void loadAiChatHistory(diagramId)
      .then((loaded) => {
        if (!cancelled) {
          setMessages(loaded);
          setChatHydrated(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
          setChatHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [diagramId]);

  useEffect(() => {
    if (!chatHydrated || diagramId == null) return;
    const t = window.setTimeout(() => {
      void saveAiChatHistory(diagramId, messages);
    }, 300);
    return () => window.clearTimeout(t);
  }, [chatHydrated, diagramId, messages]);

  useEffect(() => {
    if (!chatHydrated) return;
    if (messages.length === 0 && !sending) return;
    const id = requestAnimationFrame(() => {
      chatScrollEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [chatHydrated, messages, sending]);

  const pinnedLabelsPhrase = useMemo(
    () => pinnedTablesForChips.map((p) => `"${p.label}"`).join(", "),
    [pinnedTablesForChips],
  );

  const contextJson = useMemo(() => {
    if (!diagram) return "";
    const ctx = buildDiagramContext(
      diagram.data,
      diagram.dbType,
      selectedNodeId,
      selectedEdgeId,
      aiChatPinnedTableIds,
    );
    return diagramContextToPromptJson(ctx);
  }, [
    diagram,
    selectedNodeId,
    selectedEdgeId,
    aiChatPinnedTableIds,
  ]);

  const keyStatus = useMemo(() => {
    if (!storedKeyPresent) {
      return {
        label: "No API key",
        variant: "secondary" as const,
        className:
          "border-transparent bg-muted text-muted-foreground hover:bg-muted",
      };
    }
    if (!sessionUnlocked) {
      return {
        label: "Saved · unlock to chat",
        variant: "outline" as const,
        className:
          "border-amber-500/35 bg-amber-500/[0.12] text-amber-950 dark:text-amber-100",
      };
    }
    return {
      label: "Ready",
      variant: "default" as const,
      className: "",
    };
  }, [storedKeyPresent, sessionUnlocked]);

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || !diagram) return;
    if (isLocked) {
      showError("Diagram is locked.");
      return;
    }
    const key = apiKeyRef.current;
    if (!key) {
      showError("Add your API key in settings.");
      setKeyModalOpen(true);
      return;
    }

    setDraft("");
    const userMessage = text;
    setMessages((m) => [...m, { role: "user", content: userMessage }]);
    setSending(true);

    try {
      const history: { role: "user" | "model"; text: string }[] =
        messages.map((msg) => ({
          role: msg.role,
          text: msg.content,
        }));

      const scopeHint =
        pinnedLabelsPhrase.length > 0
          ? `The user scoped this chat to these tables: ${pinnedLabelsPhrase}, including their diagram neighbors (see aiChatTarget in the JSON). Prefer coordinated schema updates across that subgraph when relevant.\n\n`
          : "";

      const augmentedUser = `${userMessage}

${scopeHint}Below is the live diagram snapshot — use it as the only source of truth for ids and column types. If "editorFocus" or "aiChatTarget" is set, treat them as intent anchors when the message is underspecified.

Current diagram (JSON):
${contextJson}`;

      const rawText = await callGeminiDiagramAssistant({
        apiKey: key,
        systemInstruction: SYSTEM_INSTRUCTION,
        history,
        userMessage: augmentedUser,
      });

      let parsed: unknown;
      try {
        parsed = parseModelJson(rawText);
      } catch {
        showError("Model did not return valid JSON.");
        setMessages((m) => [
          ...m,
          {
            role: "model",
            content:
              "Sorry, I could not parse the model response as JSON. Raw output:\n\n```\n" +
              rawText.slice(0, 2000) +
              (rawText.length > 2000 ? "\n…" : "") +
              "\n```",
          },
        ]);
        return;
      }

      const applyResult = applyAiDiagramOperations(parsed);
      if (!applyResult.ok) {
        showError(applyResult.error);
        const summary =
          typeof parsed === "object" &&
          parsed !== null &&
          "summary" in parsed &&
          typeof (parsed as { summary?: unknown }).summary === "string"
            ? (parsed as { summary: string }).summary
            : null;
        setMessages((m) => [
          ...m,
          {
            role: "model",
            content:
              (summary ? `${summary}\n\n` : "") +
              `**Changes were not applied:** ${applyResult.error}`,
          },
        ]);
        return;
      }

      const opCount =
        parsed &&
        typeof parsed === "object" &&
        parsed !== null &&
        "operations" in parsed &&
        Array.isArray((parsed as { operations: unknown }).operations)
          ? (parsed as { operations: unknown[] }).operations.length
          : 0;

      const appliedSummary = applyResult.summary?.trim();
      const appliedNote =
        appliedSummary ??
        (opCount === 0
          ? "No diagram changes in this response."
          : "Changes applied to the diagram.");

      setMessages((m) => [
        ...m,
        { role: "model", content: appliedNote || "Done." },
      ]);
      if (opCount > 0) {
        showSuccess("Diagram updated.");
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Request failed.";
      showError(msg);
      setMessages((m) => [
        ...m,
        {
          role: "model",
          content: `Request failed: ${msg}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [
    draft,
    diagram,
    isLocked,
    messages,
    contextJson,
    applyAiDiagramOperations,
    pinnedLabelsPhrase,
  ]);

  if (!diagram) return null;

  const canSend =
    !isLocked && !sending && draft.trim().length > 0 && sessionUnlocked;

  let textareaPlaceholder = "Ask for tables, columns, or relationships…";
  if (isLocked) {
    textareaPlaceholder = "Unlock diagram to chat…";
  } else if (!sessionUnlocked) {
    textareaPlaceholder = "Unlock your API key to start…";
  } else if (pinnedTablesForChips.length === 1) {
    const label = pinnedTablesForChips.at(0)?.label ?? "this table";
    textareaPlaceholder = `Describe changes to "${label}" or its related tables…`;
  } else if (pinnedTablesForChips.length > 1) {
    textareaPlaceholder =
      "Describe changes to the pinned tables and their related tables…";
  }

  return (
    <>
      <GeminiKeyModal
        open={keyModalOpen}
        onOpenChange={setKeyModalOpen}
        storedKeyPresent={storedKeyPresent}
        onStoredKeyChange={setStoredKeyPresent}
        sessionUnlocked={sessionUnlocked}
        onSessionUnlockedChange={setSessionUnlocked}
        apiKeyRef={apiKeyRef}
      />

      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b bg-gradient-to-b from-primary/[0.06] to-transparent px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">
                  Schema assistant
                </h2>
                <Badge
                  variant={keyStatus.variant}
                  className={cn("font-normal", keyStatus.className)}
                >
                  {keyStatus.label}
                </Badge>
                <Badge
                  variant="outline"
                  className="max-w-[14rem] truncate border-border/80 font-mono text-[10px] font-normal text-muted-foreground"
                  title={GEMINI_DIAGRAM_MODEL}
                  aria-label={`AI model: ${GEMINI_DIAGRAM_MODEL}`}
                >
                  {GEMINI_DIAGRAM_MODEL}
                </Badge>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Powered by Google Gemini. After you unlock once, you stay signed in for
                this tab until you lock or close it. Diagram data is sent with
                each message.
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setKeyModalOpen(true)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  API key
                </Button>
                {storedKeyPresent && !sessionUnlocked && (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setKeyModalOpen(true)}
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Unlock
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-4 pb-2">
            {messages.length === 0 && !sending ? (
              <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
                  <Bot className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  Describe what to add or change
                </p>
                <p className="mx-auto mt-1 max-w-[240px] text-xs text-muted-foreground leading-relaxed">
                  For example: add a{" "}
                  <span className="font-mono text-[11px]">users</span> table
                  with id and email, or link{" "}
                  <span className="font-mono text-[11px]">orders</span> to{" "}
                  <span className="font-mono text-[11px]">users</span>.
                </p>
                {!storedKeyPresent && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-4"
                    onClick={() => setKeyModalOpen(true)}
                  >
                    Add API key
                  </Button>
                )}
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-2.5",
                      msg.role === "user" ? "flex-row-reverse" : "flex-row",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {msg.role === "user" ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "max-w-[min(100%,20rem)] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-md"
                          : "border bg-card rounded-tl-md prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2",
                      )}
                    >
                      {msg.role === "model" ? (
                        <Markdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </Markdown>
                      ) : (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {msg.content}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {sending && <AiChatThinkingIndicator />}
                <div
                  ref={chatScrollEndRef}
                  className="h-px w-full shrink-0"
                  aria-hidden
                />
              </>
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t bg-card/80 p-3 backdrop-blur-sm">
          {pinnedTablesForChips.length > 0 && (
            <div className="mb-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                {pinnedTablesForChips.map(({ id: tableId, label }) => (
                  <div
                    key={tableId}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 pl-2.5 text-xs shadow-sm"
                  >
                    <Sparkles
                      className="h-3 w-3 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span className="truncate font-medium">{label}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 rounded-full"
                      onClick={() => removeAiChatPinnedTable(tableId)}
                      aria-label={`Remove ${label} from AI chat scope`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Scoped to these tables and their linked neighbors on the diagram.
              </p>
            </div>
          )}
          <div
            className={cn(
              "flex gap-2 rounded-2xl border bg-background p-2 shadow-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring/30",
              isLocked && "opacity-60",
            )}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={textareaPlaceholder}
              disabled={isLocked || sending || !sessionUnlocked}
              className="min-h-[44px] max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              disabled={!canSend}
              className="h-11 w-11 shrink-0 rounded-xl"
              onClick={() => void sendMessage()}
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <SendHorizontal className="h-5 w-5" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground">
            ⌘/Ctrl + Enter to send · do not paste secrets
          </p>
        </div>
      </div>
    </>
  );
}
