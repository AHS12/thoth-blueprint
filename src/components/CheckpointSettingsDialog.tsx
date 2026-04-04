import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { type CheckpointSettings } from "@/lib/types";
import { useEffect, useState } from "react";

const CHECKPOINT_INTERVAL_MIN = 5;
const CHECKPOINT_INTERVAL_MAX = 240;
const CHECKPOINT_RETENTION_MIN = 1;
const CHECKPOINT_RETENTION_MAX = 40;
const CHECKPOINT_MAX_COUNT_MIN = 1;
const CHECKPOINT_MAX_COUNT_MAX = 100;

interface CheckpointSettingsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    settings: CheckpointSettings;
    onSave: (nextSettings: CheckpointSettings) => void;
}

export function CheckpointSettingsDialog({
    isOpen,
    onOpenChange,
    settings,
    onSave,
}: CheckpointSettingsDialogProps) {
    const [draft, setDraft] = useState<CheckpointSettings>(settings);

    useEffect(() => {
        if (isOpen) {
            setDraft(settings);
        }
    }, [isOpen, settings]);

    const clampInteger = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(max, Math.round(value)));

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Checkpoint Settings</DialogTitle>
                    <DialogDescription>
                        Tune automatic checkpoint frequency and retention to match project size.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-md border p-3">
                        <div>
                            <Label className="text-sm font-medium">Enable Automatic Checkpoints</Label>
                            <p className="text-xs text-muted-foreground">
                                When enabled, checkpoints are created on a fixed interval.
                            </p>
                        </div>
                        <Switch
                            checked={draft.enabled}
                            onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, enabled: checked }))}
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="checkpoint-interval">Interval</Label>
                                <span className="text-xs text-muted-foreground">{draft.intervalMinutes} minutes</span>
                            </div>
                            <Slider
                                id="checkpoint-interval"
                                min={CHECKPOINT_INTERVAL_MIN}
                                max={CHECKPOINT_INTERVAL_MAX}
                                step={5}
                                value={[draft.intervalMinutes]}
                                onValueChange={(value) => {
                                    setDraft((prev) => ({
                                        ...prev,
                                        intervalMinutes: clampInteger(
                                            value[0] ?? prev.intervalMinutes,
                                            CHECKPOINT_INTERVAL_MIN,
                                            CHECKPOINT_INTERVAL_MAX,
                                        ),
                                    }));
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="checkpoint-retention">Retention</Label>
                                <span className="text-xs text-muted-foreground">{draft.retentionHours} hours</span>
                            </div>
                            <Slider
                                id="checkpoint-retention"
                                min={CHECKPOINT_RETENTION_MIN}
                                max={CHECKPOINT_RETENTION_MAX}
                                step={1}
                                value={[draft.retentionHours]}
                                onValueChange={(value) => {
                                    setDraft((prev) => ({
                                        ...prev,
                                        retentionHours: clampInteger(
                                            value[0] ?? prev.retentionHours,
                                            CHECKPOINT_RETENTION_MIN,
                                            CHECKPOINT_RETENTION_MAX,
                                        ),
                                    }));
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="checkpoint-max-count">Max Per Diagram</Label>
                                <span className="text-xs text-muted-foreground">{draft.maxCountPerDiagram} checkpoints</span>
                            </div>
                            <Slider
                                id="checkpoint-max-count"
                                min={CHECKPOINT_MAX_COUNT_MIN}
                                max={CHECKPOINT_MAX_COUNT_MAX}
                                step={1}
                                value={[draft.maxCountPerDiagram]}
                                onValueChange={(value) => {
                                    setDraft((prev) => ({
                                        ...prev,
                                        maxCountPerDiagram: clampInteger(
                                            value[0] ?? prev.maxCountPerDiagram,
                                            CHECKPOINT_MAX_COUNT_MIN,
                                            CHECKPOINT_MAX_COUNT_MAX,
                                        ),
                                    }));
                                }}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            onSave(draft);
                            onOpenChange(false);
                        }}
                    >
                        Save Settings
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
