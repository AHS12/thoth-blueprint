import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Github } from "lucide-react";

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const gitHash = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : '';
const displayVersion = gitHash && gitHash !== 'N/A' ? `${appVersion} (${gitHash})` : appVersion;

interface AboutDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AboutDialog({ isOpen, onOpenChange }: AboutDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <img src="/ThothBlueprint-icon.svg" alt="ThothBlueprint Logo" className="h-16 w-16 mb-2" />
          <DialogTitle className="text-2xl">ThothBlueprint</DialogTitle>
          <DialogDescription className="text-center pt-2">
            Design database schemas with an intuitive drag-and-drop editor. Import SQL, DBML, or JSON,
            then export to SQL, DBML, JSON, SVG, or PNG, or generate migrations for Laravel, TypeORM, and Django.
            Use Google Gemini or OpenRouter when online, or connect to Ollama and LM Studio for local AI models.
            Your diagrams stay stored locally, and the core editor remains offline-first.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 text-center text-sm text-muted-foreground">
          <p>Version: {displayVersion}</p>
          <p>Crafted with ❤️ by AHS12 and the community</p>
        </div>
        <div className="flex justify-center">
          <a href="https://github.com/AHS12/thoth-blueprint" target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <Github className="h-4 w-4 mr-2" />
              View on GitHub
            </Button>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
