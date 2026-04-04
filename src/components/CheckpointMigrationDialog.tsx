import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface CheckpointMigrationDialogProps {
    isOpen: boolean;
    isProcessing?: boolean;
    onEnableNow: () => void;
    onLater: () => void;
}

export function CheckpointMigrationDialog({
    isOpen,
    isProcessing = false,
    onEnableNow,
    onLater,
}: CheckpointMigrationDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onLater()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Enable Checkpoints</DialogTitle>
                    <DialogDescription>
                        Checkpoints are now available. Before enabling migration, we will create
                        a backup using your existing export flow.
                    </DialogDescription>
                </DialogHeader>

                <div className="text-sm text-muted-foreground">
                    If you choose Later, the app continues in backward-compatible mode and no
                    checkpoint migration will run until you enable it.
                </div>

                <DialogFooter>
                    <div className="flex w-full flex-col gap-2 sm:flex-row">
                        <Button
                            variant="outline"
                            className="w-full"
                            disabled={isProcessing}
                            onClick={onLater}
                        >
                            Later
                        </Button>
                        <Button className="w-full" disabled={isProcessing} onClick={onEnableNow}>
                            {isProcessing ? "Preparing Backup..." : "Enable Checkpoints"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
