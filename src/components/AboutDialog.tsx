import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Github } from "lucide-react";

const appVersion =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const gitHash =
  typeof __GIT_HASH__ !== "undefined" ? __GIT_HASH__ : "";

const displayVersion =
  gitHash && gitHash !== "N/A"
    ? `${appVersion} (${gitHash})`
    : appVersion;

interface AboutDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AboutDialog({
  isOpen,
  onOpenChange,
}: AboutDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center">
          <img
            src="/ThothBlueprint-icon.svg"
            alt="ThothBlueprint Logo"
            className="h-16 w-16 mb-2"
          />

          <DialogTitle className="text-2xl">
            Thoth Blueprint
          </DialogTitle>

          <DialogDescription asChild>
            <div className="space-y-3 pt-2 text-center text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">
                  Design databases the way you think.
                </span>
                <br />
                Create and evolve{" "}
                <span className="font-medium text-foreground">
                  unlimited schemas
                </span>{" "}
                with a visual drag-and-drop editor. Start from scratch or import
                an existing SQL, DBML, or JSON schema, then shape your database
                visually and see relationships at a glance.
              </p>

              <p>
                Turn your design into something useful: export SQL, DBML, JSON,
                SVG, or PNG, or generate migrations for Laravel, TypeORM, and
                Django.
              </p>

              <p>
                Bring AI into your workflow with Google Gemini or OpenRouter,
                or connect Ollama and LM Studio to run models locally.
              </p>

              <p className="font-medium text-foreground">
                Offline-first. Local by default. Your schema stays yours.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 text-center text-sm text-muted-foreground">
          <p>Version: {displayVersion}</p>
          <p>Crafted with ❤️ by AHS12 and the community</p>
        </div>

        <div className="flex justify-center">
          <a
            href="https://github.com/AHS12/thoth-blueprint"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">
              <Github className="mr-2 h-4 w-4" />
              View on GitHub
            </Button>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}