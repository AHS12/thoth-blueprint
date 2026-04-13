import {
  clearEncryptedGeminiKey,
  clearGeminiKeySession,
  decryptGeminiKey,
  saveEncryptedGeminiKey,
  saveGeminiKeyToSession,
} from "@/lib/ai/geminiEncryptedStorage";
import { showError, showSuccess } from "@/utils/toast";
import { ExternalLink } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
} from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type GeminiKeyModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storedKeyPresent: boolean;
  onStoredKeyChange: (present: boolean) => void;
  sessionUnlocked: boolean;
  onSessionUnlockedChange: (unlocked: boolean) => void;
  apiKeyRef: MutableRefObject<string | null>;
};

export function GeminiKeyModal({
  open,
  onOpenChange,
  storedKeyPresent,
  onStoredKeyChange,
  sessionUnlocked,
  onSessionUnlockedChange,
  apiKeyRef,
}: GeminiKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [passphraseSave, setPassphraseSave] = useState("");
  const [passphraseUnlock, setPassphraseUnlock] = useState("");

  useEffect(() => {
    if (!open) {
      setApiKey("");
      setPassphraseSave("");
      setPassphraseUnlock("");
    }
  }, [open]);

  const handleSave = useCallback(async () => {
    const k = apiKey.trim();
    if (!k || !passphraseSave) {
      showError("Enter your API key and a passphrase.");
      return;
    }
    try {
      await saveEncryptedGeminiKey(k, passphraseSave);
      apiKeyRef.current = k;
      saveGeminiKeyToSession(k);
      onSessionUnlockedChange(true);
      onStoredKeyChange(true);
      showSuccess("Key saved and unlocked on this device.");
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      showError("Could not save the key.");
    }
  }, [
    apiKey,
    passphraseSave,
    apiKeyRef,
    onSessionUnlockedChange,
    onStoredKeyChange,
    onOpenChange,
  ]);

  const handleUnlock = useCallback(async () => {
    if (!passphraseUnlock) {
      showError("Enter your passphrase.");
      return;
    }
    try {
      const k = await decryptGeminiKey(passphraseUnlock);
      apiKeyRef.current = k;
      saveGeminiKeyToSession(k);
      onSessionUnlockedChange(true);
      showSuccess("Ready to chat.");
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      showError(
        e instanceof Error ? e.message : "Could not unlock the key.",
      );
    }
  }, [passphraseUnlock, apiKeyRef, onSessionUnlockedChange, onOpenChange]);

  const handleLockMemory = useCallback(() => {
    clearGeminiKeySession();
    apiKeyRef.current = null;
    onSessionUnlockedChange(false);
    showSuccess(
      "Key cleared for this tab. Unlock again to chat, or close the tab to clear the session.",
    );
    onOpenChange(false);
  }, [apiKeyRef, onSessionUnlockedChange, onOpenChange]);

  const handleRemoveStored = useCallback(() => {
    clearEncryptedGeminiKey();
    apiKeyRef.current = null;
    onSessionUnlockedChange(false);
    onStoredKeyChange(false);
    showSuccess("Saved key removed from this browser.");
    onOpenChange(false);
  }, [apiKeyRef, onSessionUnlockedChange, onStoredKeyChange, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 overflow-hidden p-0">
        <div className="border-b bg-muted/40 px-6 py-4">
          <DialogHeader className="gap-1 text-left space-y-1">
            <DialogTitle>Gemini API key</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Your key is encrypted with your passphrase and kept in this
              browser only.{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                Get a key
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          {!storedKeyPresent ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gemini-key">API key</Label>
                <Input
                  id="gemini-key"
                  type="password"
                  autoComplete="off"
                  placeholder="Paste your key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gemini-pass-new">Passphrase</Label>
                <Input
                  id="gemini-pass-new"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Encrypts the key on this device"
                  value={passphraseSave}
                  onChange={(e) => setPassphraseSave(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!sessionUnlocked ? (
                <div className="space-y-2">
                  <Label htmlFor="gemini-pass-unlock">Passphrase</Label>
                  <Input
                    id="gemini-pass-unlock"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Unlock your saved key"
                    value={passphraseUnlock}
                    onChange={(e) => setPassphraseUnlock(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleUnlock();
                    }}
                  />
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Session is unlocked. Lock when you are done, or update the
                    saved key below.
                  </p>
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-foreground">
                      Update saved key
                    </p>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="New API key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-9"
                    />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Passphrase"
                      value={passphraseSave}
                      onChange={(e) => setPassphraseSave(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-3 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {storedKeyPresent && sessionUnlocked && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLockMemory}
                >
                  Lock session
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleRemoveStored}
                >
                  Remove saved key
                </Button>
              </>
            )}
          </div>
          <div className="flex w-full justify-end gap-2 sm:w-auto">
            {!storedKeyPresent ? (
              <Button type="button" onClick={() => void handleSave()}>
                Save & unlock
              </Button>
            ) : sessionUnlocked ? (
              <Button
                type="button"
                disabled={!apiKey.trim() || !passphraseSave}
                onClick={() => void handleSave()}
              >
                Update saved key
              </Button>
            ) : (
              <Button type="button" onClick={() => void handleUnlock()}>
                Unlock
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
