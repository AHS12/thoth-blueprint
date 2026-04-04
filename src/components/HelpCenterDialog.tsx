import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Rocket, Sparkles } from "lucide-react";

interface HelpCenterDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onStartTour: () => void;
    onViewShortcuts: () => void;
    onViewWhatsNew: () => void;
}

export function HelpCenterDialog({
    isOpen,
    onOpenChange,
    onStartTour,
    onViewShortcuts,
    onViewWhatsNew,
}: HelpCenterDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Help Center</DialogTitle>
                    <DialogDescription>
                        Learn the editor quickly, revisit keyboard shortcuts, and discover recent improvements.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <section className="rounded-lg border p-4">
                        <h3 className="text-sm font-semibold">Getting Started</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Start with a guided tour to see the key actions and menus in context.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                                onClick={() => {
                                    onOpenChange(false);
                                    onStartTour();
                                }}
                            >
                                <Rocket className="mr-2 h-4 w-4" />
                                Start Guided Tour
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    onOpenChange(false);
                                    onViewShortcuts();
                                }}
                            >
                                Keyboard Shortcuts
                            </Button>
                        </div>
                    </section>

                    <section className="rounded-lg border p-4">
                        <h3 className="text-sm font-semibold">What Changed</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Existing users can quickly review release notes and then replay the tour for new capabilities.
                        </p>
                        <Button
                            className="mt-3"
                            variant="outline"
                            onClick={() => {
                                onOpenChange(false);
                                onViewWhatsNew();
                            }}
                        >
                            <Sparkles className="mr-2 h-4 w-4" />
                            Open What's New
                        </Button>
                    </section>

                    <section className="rounded-lg border p-4">
                        <h3 className="text-sm font-semibold">Knowledge Base</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Use these menu paths as a quick knowledge map inside the app.
                        </p>
                        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                            <p>Help -&gt; Help Center: onboarding and guided flow.</p>
                            <p>Help -&gt; What's New: version highlights and upgrade notes.</p>
                            <p>Help -&gt; View Shortcuts: power-user commands for faster editing.</p>
                            <p>Settings -&gt; Check for Updates: manually check for newer builds.</p>
                        </div>
                    </section>
                </div>

                <DialogFooter>
                    <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
