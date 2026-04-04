import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface WhatsNewDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  markdown?: string;
  onReload?: () => void;
  onStartTour?: () => void;
}

export function WhatsNewDialog({ isOpen, onOpenChange, markdown = "", onReload, onStartTour }: WhatsNewDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100vw-2rem)] sm:w-full
          sm:max-w-2xl md:max-w-3xl lg:max-w-4xl
          max-h-[calc(100vh-6rem)]
        "
      >
        <DialogHeader>
          <DialogTitle>What’s New</DialogTitle>
          <DialogDescription>
            Highlights and fixes included in this update.
          </DialogDescription>
        </DialogHeader>
        {/* Scrollable content area for long release notes */}
        <div
          className="
            overflow-y-auto no-scrollbar
            max-h-[calc(100vh-15rem)]
            prose dark:prose-invert max-w-none
            pr-2
          "
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {markdown}
          </ReactMarkdown>
        </div>
        <DialogFooter>
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            {onStartTour && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onOpenChange(false);
                  onStartTour();
                }}
              >
                Take Tour
              </Button>
            )}
            {onReload ? (
              <Button onClick={onReload} className="w-full">Reload Now</Button>
            ) : (
              <Button onClick={() => onOpenChange(false)} className="w-full">Close</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}