import { exportToDbml } from "@/lib/exporter/sql-dbml-json-exporter";
import { parseDbmlAsync } from "@/lib/importer/dbml-parser";
import { type Column, type Diagram } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useStore } from "@/store/store";
import { showError, showSuccess } from "@/utils/toast";
import { sql } from "@codemirror/lang-sql";
import { bracketMatching, StreamLanguage } from "@codemirror/language";
import { lineNumbers } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { AlertCircle, CheckCircle2, CircleDot, RefreshCw, Save, XCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface DbmlDiagnostic {
    message: string;
    line?: number;
    column?: number;
}

interface DbmlTabProps {
    diagram: Diagram;
    isLocked: boolean;
    onDirtyChange?: (dirty: boolean) => void;
}

const dbmlLanguage = StreamLanguage.define({
    startState: () => ({}),
    token: (stream) => {
        if (stream.eatSpace()) return null;

        if (stream.match(/\/\/.*$/)) return "comment";
        if (stream.match(/\/\*/)) {
            while (!stream.eol()) {
                if (stream.match("*/")) break;
                stream.next();
            }
            return "comment";
        }

        if (stream.match(/^'''[\s\S]*?'''/)) return "string";
        if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";
        if (stream.match(/'(?:[^'\\]|\\.)*'/)) return "string";

        if (stream.match(/\b(Table|TablePartial|TableGroup|Ref|Enum|Project|Indexes|Note)\b/i)) {
            return "keyword";
        }

        if (stream.match(/\b(pk|primary key|unique|not null|null|increment|default|note)\b/i)) {
            return "atom";
        }

        if (stream.match(/[{}[\](),.:<>-]/)) return "operator";
        if (stream.match(/[A-Za-z_][\w$]*/)) return "variableName";

        stream.next();
        return null;
    },
});

function normalizeError(error: unknown): DbmlDiagnostic[] {
    const fallback = [{ message: "Unknown DBML parsing error." }];

    if (!error) return fallback;

    if (Array.isArray(error) && error.length > 0) {
        return error.map((item) => extractLineColumn(getReadableErrorMessage(item)));
    }

    if (typeof error === "string") {
        return [extractLineColumn(error)];
    }

    if (!(error instanceof Error)) {
        return [extractLineColumn(getReadableErrorMessage(error))];
    }

    const anyError = error as Error & {
        diagnostics?: Array<{
            message?: string | { message?: string };
            location?: { start?: { line?: number; column?: number } };
        }>;
        errors?: unknown[];
        location?: { start?: { line?: number; column?: number } };
    };

    if (Array.isArray(anyError.errors) && anyError.errors.length > 0) {
        return anyError.errors.map((item) => extractLineColumn(getReadableErrorMessage(item)));
    }

    if (Array.isArray(anyError.diagnostics) && anyError.diagnostics.length > 0) {
        return anyError.diagnostics.map((diagnostic) => {
            const normalized: DbmlDiagnostic = {
                message: getReadableErrorMessage(diagnostic.message ?? error.message),
            };

            const line = diagnostic.location?.start?.line;
            const column = diagnostic.location?.start?.column;

            if (typeof line === "number") {
                normalized.line = line;
            }

            if (typeof column === "number") {
                normalized.column = column;
            }

            return normalized;
        });
    }

    const base = extractLineColumn(getReadableErrorMessage(error));

    if (anyError.location?.start?.line) {
        base.line = anyError.location.start.line;
        if (typeof anyError.location.start.column === "number") {
            base.column = anyError.location.start.column;
        }
    }

    return [base];
}

function getReadableErrorMessage(value: unknown, seen = new WeakSet<object>()): string {
    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value);
    }

    if (value == null) {
        return "Unknown DBML parsing error.";
    }

    if (value instanceof Error) {
        const nestedMessage = getReadableErrorMessage((value as Error & { cause?: unknown }).cause);
        return nestedMessage && nestedMessage !== "Unknown DBML parsing error."
            ? `${value.message || "Unknown DBML parsing error."} (${nestedMessage})`
            : (value.message || "Unknown DBML parsing error.");
    }

    if (typeof value === "object") {
        const record = value as Record<string, unknown>;

        if (seen.has(record)) {
            return "Unknown DBML parsing error.";
        }
        seen.add(record);

        if (typeof record.message === "string" && record.message.trim()) {
            return record.message;
        }

        if (record.message) {
            const nested = getReadableErrorMessage(record.message, seen);
            if (nested && nested !== "Unknown DBML parsing error.") {
                return nested;
            }
        }

        if (Array.isArray(record.errors) && record.errors.length > 0) {
            return getReadableErrorMessage(record.errors[0], seen);
        }

        if (typeof record.name === "string" && typeof record.expected === "string") {
            return `${record.name}: expected ${record.expected}`;
        }

        try {
            const serialized = JSON.stringify(record, (_key, current) => {
                if (typeof current === "object" && current !== null) {
                    if (seen.has(current as Record<string, unknown>)) {
                        return "[Circular]";
                    }
                    seen.add(current as Record<string, unknown>);
                }
                return current;
            });
            if (serialized && serialized !== "{}") {
                return serialized;
            }
        } catch {
            // Fall through to final string conversion.
        }

        return String(record);
    }

    return String(value);
}

function normalizeLabel(value: string): string {
    return value.trim().toLowerCase();
}

function columnSignature(columns: Array<{ name: string; type: string }>): string {
    return columns
        .map((column) => `${column.name.toLowerCase()}:${column.type.toLowerCase()}`)
        .sort()
        .join("|");
}

function getColumnIdFromHandle(handleId: string | null | undefined): string | null {
    if (!handleId) return null;
    const parts = handleId.split("-");
    return parts.length >= 3 ? parts.slice(0, -2).join("-") : handleId;
}

function remapHandleColumnId(
    handleId: string | null | undefined,
    originalNodeId: string,
    columnIdReplacement: Map<string, string>,
): string | null | undefined {
    if (!handleId) return handleId;

    const parts = handleId.split("-");
    const oldColumnId = getColumnIdFromHandle(handleId);

    if (!oldColumnId) return handleId;

    const replacement = columnIdReplacement.get(`${originalNodeId}:${oldColumnId}`);
    if (!replacement) return handleId;

    if (parts.length < 3) return replacement;
    return `${replacement}-${parts.slice(-2).join("-")}`;
}

function preserveNodeLayoutAndIds(
    currentDiagram: Diagram,
    parsedData: Diagram["data"],
): Diagram["data"] {
    const existingNodes = currentDiagram.data.nodes;
    const parsedNodes = parsedData.nodes;

    const unmatchedExisting = new Set(existingNodes.map((node) => node.id));
    const existingById = new Map(existingNodes.map((node) => [node.id, node]));
    const existingByLabel = new Map(existingNodes.map((node) => [normalizeLabel(node.data.label), node]));
    const existingBySignature = new Map(existingNodes.map((node) => [columnSignature(node.data.columns), node]));

    const nodeIdReplacement = new Map<string, string>();
    const columnIdReplacement = new Map<string, string>();

    const nextNodes = parsedNodes.map((parsedNode) => {
        const parsedNodeId = parsedNode.id;
        const parsedLabel = normalizeLabel(parsedNode.data.label);
        const parsedSignature = columnSignature(parsedNode.data.columns);

        let matched = existingByLabel.get(parsedLabel);
        if (matched && !unmatchedExisting.has(matched.id)) {
            matched = undefined;
        }

        if (!matched) {
            const signatureMatch = existingBySignature.get(parsedSignature);
            if (signatureMatch && unmatchedExisting.has(signatureMatch.id)) {
                matched = signatureMatch;
            }
        }

        if (!matched) {
            let bestMatch: Diagram["data"]["nodes"][number] | undefined;
            let bestScore = -1;

            for (const existingId of unmatchedExisting) {
                const candidate = existingById.get(existingId);
                if (!candidate) continue;

                const candidateColumnNames = new Set(
                    candidate.data.columns.map((col: Column) => normalizeLabel(col.name)),
                );
                let overlap = 0;
                for (const column of parsedNode.data.columns) {
                    if (candidateColumnNames.has(normalizeLabel(column.name))) {
                        overlap += 1;
                    }
                }

                const sameCount = candidate.data.columns.length === parsedNode.data.columns.length ? 1 : 0;
                const score = overlap * 2 + sameCount;

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = candidate;
                }
            }

            if (bestMatch && bestScore > 1) {
                matched = bestMatch;
            }
        }

        if (!matched) {
            return parsedNode;
        }

        unmatchedExisting.delete(matched.id);
        nodeIdReplacement.set(parsedNodeId, matched.id);

        const existingColumnsByName = new Map<string, Column>(
            matched.data.columns.map((column: Column) => [normalizeLabel(column.name), column]),
        );

        const remappedColumns = parsedNode.data.columns.map((column: Column) => {
            const matchedColumn = existingColumnsByName.get(normalizeLabel(column.name));
            if (!matchedColumn) {
                return column;
            }

            columnIdReplacement.set(`${parsedNodeId}:${column.id}`, matchedColumn.id);
            return {
                ...column,
                id: matchedColumn.id,
            };
        });

        const mergedData = {
            ...parsedNode.data,
            columns: remappedColumns,
            ...(matched.data.color !== undefined ? { color: matched.data.color } : {}),
            ...(matched.data.order !== undefined ? { order: matched.data.order } : {}),
            ...(matched.data.isPositionLocked !== undefined
                ? { isPositionLocked: matched.data.isPositionLocked }
                : {}),
        };

        return {
            ...parsedNode,
            id: matched.id,
            position: matched.position,
            ...(matched.width !== undefined ? { width: matched.width } : {}),
            ...(matched.height !== undefined ? { height: matched.height } : {}),
            data: mergedData,
        };
    });

    const nextEdges = parsedData.edges.map((edge) => {
        const originalSourceNodeId = edge.source;
        const originalTargetNodeId = edge.target;
        const remappedSourceHandle = remapHandleColumnId(edge.sourceHandle, originalSourceNodeId, columnIdReplacement);
        const remappedTargetHandle = remapHandleColumnId(edge.targetHandle, originalTargetNodeId, columnIdReplacement);

        return {
            ...edge,
            source: nodeIdReplacement.get(originalSourceNodeId) ?? originalSourceNodeId,
            target: nodeIdReplacement.get(originalTargetNodeId) ?? originalTargetNodeId,
            ...(remappedSourceHandle !== undefined ? { sourceHandle: remappedSourceHandle } : {}),
            ...(remappedTargetHandle !== undefined ? { targetHandle: remappedTargetHandle } : {}),
        };
    });

    return {
        ...parsedData,
        nodes: nextNodes,
        edges: nextEdges,
    };
}

function extractLineColumn(message: string): DbmlDiagnostic {
    const regexes = [
        /line\s+(\d+)(?:\s*,\s*column\s+(\d+))?/i,
        /line\s+(\d+)(?:\s*[:]\s*(\d+))?/i,
        /\((\d+):(\d+)\)/,
        /:(\d+):(\d+)/,
    ];

    for (const regex of regexes) {
        const match = message.match(regex);
        if (!match) continue;

        const line = Number(match[1]);
        const column = match[2] ? Number(match[2]) : NaN;

        const parsed: DbmlDiagnostic = { message };
        if (Number.isFinite(line)) {
            parsed.line = line;
        }
        if (Number.isFinite(column)) {
            parsed.column = column;
        }

        return parsed;
    }

    return { message };
}

function getLinePreview(content: string, line?: number): string | undefined {
    if (!line || line < 1) return undefined;
    const lines = content.split("\n");
    return lines[line - 1]?.trim();
}

export default function DbmlTab({ diagram, isLocked, onDirtyChange }: DbmlTabProps) {
    const updateCurrentDiagramData = useStore((state) => state.updateCurrentDiagramData);
    const { resolvedTheme } = useTheme();

    const [editorValue, setEditorValue] = useState<string>("");
    const [savedValue, setSavedValue] = useState<string>("");
    const [diagnostics, setDiagnostics] = useState<DbmlDiagnostic[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const hydratedDiagramIdRef = useRef<number | undefined>(undefined);

    const isDirty = editorValue !== savedValue;
    const hasErrors = diagnostics.length > 0;

    const status = useMemo(() => {
        if (isSaving) return "saving";
        if (hasErrors) return "invalid";
        if (isDirty) return "dirty";
        if (!editorValue.trim()) return "pristine";
        return "valid";
    }, [editorValue, hasErrors, isDirty, isSaving]);

    useEffect(() => {
        if (hydratedDiagramIdRef.current === diagram.id) {
            return;
        }

        hydratedDiagramIdRef.current = diagram.id;

        const initialDbml = exportToDbml(diagram);
        setEditorValue(initialDbml);
        setSavedValue(initialDbml);
        setDiagnostics([]);
    }, [diagram]);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    const handleSave = async () => {
        if (isSaving || !isDirty) return;

        if (isLocked) {
            showError("This diagram is locked. Unlock it to apply DBML changes.");
            return;
        }

        setIsSaving(true);

        try {
            const parsed = await parseDbmlAsync(editorValue, () => undefined, false);
            const parsedWithLayout = preserveNodeLayoutAndIds(diagram, parsed);
            const updatedData = {
                ...diagram.data,
                ...parsedWithLayout,
            };

            updateCurrentDiagramData(updatedData);

            const canonicalDbml = exportToDbml({
                ...diagram,
                data: updatedData,
            });

            setEditorValue(canonicalDbml);
            setSavedValue(canonicalDbml);
            setDiagnostics([]);
            showSuccess("DBML saved and synced to the diagram.");
        } catch (error) {
            const normalized = normalizeError(error);
            setDiagnostics(normalized);
            showError(`DBML save failed. ${normalized.length} error${normalized.length > 1 ? "s" : ""} found.`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualRefresh = () => {
        if (isDirty) {
            const shouldReplace = window.confirm(
                "You have unsaved DBML changes. Replace editor content with the current diagram DBML?",
            );

            if (!shouldReplace) return;
        }

        const latest = exportToDbml(diagram);
        setEditorValue(latest);
        setSavedValue(latest);
        setDiagnostics([]);
    };

    const firstError = diagnostics[0];

    return (
        <div className="flex h-full flex-col px-4 pb-4">
            <div className="mb-2 mt-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge
                        variant="secondary"
                        className={cn(
                            "capitalize",
                            status === "valid" && "text-emerald-700 dark:text-emerald-400",
                            status === "dirty" && "text-amber-700 dark:text-amber-400",
                            status === "invalid" && "text-rose-700 dark:text-rose-400",
                        )}
                    >
                        {status === "saving" && <CircleDot className="mr-1 h-3 w-3 animate-pulse" />}
                        {status === "valid" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {status === "dirty" && <AlertCircle className="mr-1 h-3 w-3" />}
                        {status === "invalid" && <XCircle className="mr-1 h-3 w-3" />}
                        {status}
                    </Badge>
                    {isDirty && (
                        <Badge variant="outline" className="text-amber-700 dark:text-amber-400">
                            Unsaved changes
                        </Badge>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleManualRefresh} disabled={isSaving}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh from diagram
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSave()}
                        disabled={!isDirty || isSaving || isLocked}
                        aria-label="Save DBML and sync diagram"
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? "Saving..." : "Save"}
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-md border [&_.cm-editor]:h-full [&_.cm-editor]:min-h-0 [&_.cm-scroller]:overflow-auto">
                <CodeMirror
                    value={editorValue}
                    height="100%"
                    maxHeight="100%"
                    extensions={[lineNumbers(), bracketMatching(), dbmlLanguage, sql()]}
                    theme={resolvedTheme === "dark" ? "dark" : "light"}
                    className="h-full"
                    onChange={(value) => {
                        setEditorValue(value);
                    }}
                    basicSetup={{
                        lineNumbers: false,
                        foldGutter: true,
                        autocompletion: true,
                        bracketMatching: false,
                        highlightActiveLine: true,
                    }}
                />
            </div>

            {hasErrors && (
                <div className="mt-3 rounded-md border border-rose-300/70 bg-rose-50/70 p-3 dark:border-rose-900/60 dark:bg-rose-950/30">
                    <div className="mb-2 flex items-center gap-2 text-rose-700 dark:text-rose-300">
                        <AlertCircle className="h-4 w-4" />
                        <h4 className="text-sm font-semibold">DBML Errors</h4>
                    </div>
                    <p className="mb-2 text-xs text-rose-700/90 dark:text-rose-300/90">
                        {firstError?.message}
                    </p>
                    <div className="rounded border border-rose-200/70 bg-background">
                        <ScrollArea className="max-h-36">
                            <div className="space-y-2 p-2">
                                {diagnostics.map((diagnostic, index) => {
                                    const preview = getLinePreview(editorValue, diagnostic.line);

                                    return (
                                        <div key={`${diagnostic.message}-${index}`} className="rounded border p-2">
                                            <p className="text-xs font-medium text-foreground">{diagnostic.message}</p>
                                            {(diagnostic.line || diagnostic.column) && (
                                                <p className="mt-1 text-[11px] text-muted-foreground">
                                                    Line {diagnostic.line ?? "-"}, Column {diagnostic.column ?? "-"}
                                                </p>
                                            )}
                                            {preview && (
                                                <p className="mt-1 truncate text-[11px] text-muted-foreground">{preview}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </div>
            )}
        </div>
    );
}
