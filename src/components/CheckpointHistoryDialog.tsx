import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { type DiagramCheckpoint } from "@/lib/types";
import { useMemo, useState } from "react";

interface CheckpointHistoryDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    checkpoints: DiagramCheckpoint[];
    onRestore: (checkpointId: number) => void;
    onCreateCheckpoint?: () => Promise<void> | void;
}

export function CheckpointHistoryDialog({
    isOpen,
    onOpenChange,
    checkpoints,
    onRestore,
    onCreateCheckpoint,
}: CheckpointHistoryDialogProps) {
    const [previewCheckpointId, setPreviewCheckpointId] = useState<number | null>(null);
    const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false);

    const previewCheckpoint = useMemo(
        () => checkpoints.find((checkpoint) => checkpoint.id === previewCheckpointId),
        [checkpoints, previewCheckpointId],
    );

    const previewCounts = useMemo(() => {
        if (!previewCheckpoint) {
            return {
                activeTableCount: 0,
                activeRelationshipCount: 0,
                noteCount: 0,
                zoneCount: 0,
            };
        }

        const activeNodes = (previewCheckpoint.data.nodes || []).filter(
            (node) => !node.data?.isDeleted,
        );
        const activeNodeIds = new Set(activeNodes.map((node) => node.id));
        const activeEdges = (previewCheckpoint.data.edges || []).filter(
            (edge) => activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target),
        );

        return {
            activeTableCount: activeNodes.length,
            activeRelationshipCount: activeEdges.length,
            noteCount: previewCheckpoint.data.notes?.length || 0,
            zoneCount: previewCheckpoint.data.zones?.length || 0,
        };
    }, [previewCheckpoint]);

    const handleCreateCheckpoint = async () => {
        if (!onCreateCheckpoint || isCreatingCheckpoint) {
            return;
        }

        setIsCreatingCheckpoint(true);
        try {
            await onCreateCheckpoint();
        } finally {
            setIsCreatingCheckpoint(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-3xl lg:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Checkpoint History</DialogTitle>
                    <DialogDescription>
                        Restore your diagram to any previous checkpoint.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">Showing {checkpoints.length} checkpoints</div>
                    {onCreateCheckpoint && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCreateCheckpoint}
                            disabled={isCreatingCheckpoint}
                        >
                            {isCreatingCheckpoint ? "Creating..." : "Create Checkpoint"}
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="max-h-[45vh] overflow-y-auto rounded-md border sm:max-h-[52vh]">
                        {checkpoints.length === 0 ? (
                            <div className="p-6 text-sm text-muted-foreground">No checkpoints yet.</div>
                        ) : (
                            <div className="divide-y">
                                {checkpoints.map((checkpoint) => (
                                    <div
                                        key={checkpoint.id}
                                        className="flex items-center justify-between gap-3 p-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium">
                                                Checkpoint #{checkpoint.checkpointNumber}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {new Date(checkpoint.createdAt).toLocaleString()} - {checkpoint.type}
                                            </div>
                                            {checkpoint.label && (
                                                <div className="text-xs text-muted-foreground">Label: {checkpoint.label}</div>
                                            )}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPreviewCheckpointId(checkpoint.id || null)}
                                        >
                                            Preview
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-md border p-4 min-h-[220px] sm:min-h-[260px]">
                        {!previewCheckpoint ? (
                            <div className="text-sm text-muted-foreground">
                                Select a checkpoint to preview before restoring.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div>
                                    <div className="text-sm font-semibold">
                                        Checkpoint #{previewCheckpoint.checkpointNumber}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(previewCheckpoint.createdAt).toLocaleString()}
                                    </div>
                                </div>

                                {previewCheckpoint.label && (
                                    <div className="text-sm">Label: {previewCheckpoint.label}</div>
                                )}

                                <div className="text-sm text-muted-foreground">
                                    <div>Tables: {previewCounts.activeTableCount}</div>
                                    <div>Relationships: {previewCounts.activeRelationshipCount}</div>
                                    <div>Notes: {previewCounts.noteCount}</div>
                                    <div>Zones: {previewCounts.zoneCount}</div>
                                </div>

                                <div className="pt-2">
                                    <Button
                                        className="w-full"
                                        onClick={() => previewCheckpoint.id && onRestore(previewCheckpoint.id)}
                                    >
                                        Confirm Restore
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
