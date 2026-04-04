import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

interface ManualCheckpointDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onCreate: (label?: string) => Promise<void>;
}

export function ManualCheckpointDialog({
    isOpen,
    onOpenChange,
    onCreate,
}: ManualCheckpointDialogProps) {
    const [label, setLabel] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setLabel("");
            setIsSubmitting(false);
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create Checkpoint</DialogTitle>
                    <DialogDescription>
                        Optionally add a label so this checkpoint is easy to find later.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <Input
                        placeholder="Optional label, e.g. Before schema refactor"
                        value={label}
                        maxLength={120}
                        onChange={(event) => setLabel(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Leave empty to create an unnamed checkpoint.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        disabled={isSubmitting}
                        onClick={async () => {
                            setIsSubmitting(true);
                            await onCreate(label);
                            setIsSubmitting(false);
                        }}
                    >
                        {isSubmitting ? "Creating..." : "Create Checkpoint"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
