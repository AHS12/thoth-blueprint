import {
  clearAiKeySession,
  clearEncryptedAiKey,
  decryptAiKey,
  saveAiKeyToSession,
  saveEncryptedAiKey,
} from "@/lib/ai/aiCredentialStorage";
import type { AiProviderId } from "@/lib/types";
import { showError, showSuccess } from "@/utils/toast";
import { Check, ExternalLink, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
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

export interface AiCredentialStatus {
  stored: boolean;
  unlocked: boolean;
}

export type AiCredentialStatuses = Record<AiProviderId, AiCredentialStatus>;
export type AiApiKeysRef = MutableRefObject<
  Record<AiProviderId, string | null>
>;

const PROVIDERS: Array<{
  id: AiProviderId;
  name: string;
  description: string;
  keyUrl: string;
}> = [
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Direct access to Google Gemini models.",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Choose from OpenRouter's model catalog.",
    keyUrl: "https://openrouter.ai/keys",
  },
];

interface AiProvidersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKeysRef: AiApiKeysRef;
  statuses: AiCredentialStatuses;
  onStatusChange: (provider: AiProviderId, status: AiCredentialStatus) => void;
}

export function AiProvidersDialog({
  open,
  onOpenChange,
  apiKeysRef,
  statuses,
  onStatusChange,
}: AiProvidersDialogProps) {
  const [selectedProvider, setSelectedProvider] = useState<AiProviderId>(
    "gemini",
  );
  const [apiKey, setApiKey] = useState("");
  const [passphraseSave, setPassphraseSave] = useState("");
  const [passphraseUnlock, setPassphraseUnlock] = useState("");

  const provider = useMemo(
    () => PROVIDERS.find((item) => item.id === selectedProvider) ?? PROVIDERS[0]!,
    [selectedProvider],
  );
  const status = statuses[selectedProvider];

  useEffect(() => {
    if (!open) {
      setApiKey("");
      setPassphraseSave("");
      setPassphraseUnlock("");
    }
  }, [open]);

  const selectProvider = (next: AiProviderId) => {
    setSelectedProvider(next);
    setApiKey("");
    setPassphraseSave("");
    setPassphraseUnlock("");
  };

  const handleSave = useCallback(async () => {
    const key = apiKey.trim();
    if (!key || !passphraseSave) {
      showError("Enter the API key and a passphrase.");
      return;
    }
    try {
      await saveEncryptedAiKey(selectedProvider, key, passphraseSave);
      saveAiKeyToSession(selectedProvider, key);
      apiKeysRef.current[selectedProvider] = key;
      onStatusChange(selectedProvider, { stored: true, unlocked: true });
      showSuccess(`${provider.name} key saved and unlocked on this device.`);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      showError("Could not save the API key.");
    }
  }, [
    apiKey,
    apiKeysRef,
    onOpenChange,
    onStatusChange,
    passphraseSave,
    provider.name,
    selectedProvider,
  ]);

  const handleUnlock = useCallback(async () => {
    if (!passphraseUnlock) {
      showError("Enter your passphrase.");
      return;
    }
    try {
      const key = await decryptAiKey(selectedProvider, passphraseUnlock);
      saveAiKeyToSession(selectedProvider, key);
      apiKeysRef.current[selectedProvider] = key;
      onStatusChange(selectedProvider, { stored: true, unlocked: true });
      showSuccess(`${provider.name} is ready to use.`);
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      showError(error instanceof Error ? error.message : "Could not unlock the key.");
    }
  }, [
    apiKeysRef,
    onOpenChange,
    onStatusChange,
    passphraseUnlock,
    provider.name,
    selectedProvider,
  ]);

  const handleLock = useCallback(() => {
    clearAiKeySession(selectedProvider);
    apiKeysRef.current[selectedProvider] = null;
    onStatusChange(selectedProvider, { ...status, unlocked: false });
    showSuccess(`${provider.name} was locked for this tab.`);
    onOpenChange(false);
  }, [
    apiKeysRef,
    onOpenChange,
    onStatusChange,
    provider.name,
    selectedProvider,
    status,
  ]);

  const handleRemove = useCallback(() => {
    clearEncryptedAiKey(selectedProvider);
    apiKeysRef.current[selectedProvider] = null;
    onStatusChange(selectedProvider, { stored: false, unlocked: false });
    showSuccess(`${provider.name} key removed from this browser.`);
    onOpenChange(false);
  }, [
    apiKeysRef,
    onOpenChange,
    onStatusChange,
    provider.name,
    selectedProvider,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="border-b bg-muted/40 px-6 py-4">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle>AI providers</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Manage your provider keys. They are encrypted with your passphrase
              and kept in this browser only.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((item) => {
              const itemStatus = statuses[item.id];
              const active = item.id === selectedProvider;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => selectProvider(item.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.name}</span>
                    {active ? <Check className="h-4 w-4 text-primary" /> : null}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    {itemStatus.unlocked ? (
                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                    ) : itemStatus.stored ? (
                      <Lock className="h-3 w-3 text-amber-600" />
                    ) : (
                      <KeyRound className="h-3 w-3" />
                    )}
                    {itemStatus.unlocked
                      ? "Ready"
                      : itemStatus.stored
                        ? "Saved, locked"
                        : "Not configured"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">{provider.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                <a
                  href={provider.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                >
                  Get an API key
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </p>
            </div>

            {!status.stored ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`${selectedProvider}-key`}>API key</Label>
                  <Input
                    id={`${selectedProvider}-key`}
                    type="password"
                    autoComplete="off"
                    placeholder="Paste your key"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${selectedProvider}-pass-new`}>Passphrase</Label>
                  <Input
                    id={`${selectedProvider}-pass-new`}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Encrypts the key on this device"
                    value={passphraseSave}
                    onChange={(event) => setPassphraseSave(event.target.value)}
                  />
                </div>
              </div>
            ) : !status.unlocked ? (
              <div className="space-y-2">
                <Label htmlFor={`${selectedProvider}-pass-unlock`}>Passphrase</Label>
                <Input
                  id={`${selectedProvider}-pass-unlock`}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Unlock your saved key"
                  value={passphraseUnlock}
                  onChange={(event) => setPassphraseUnlock(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleUnlock();
                  }}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This provider is ready for chat in the current tab.
                </p>
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium">Update saved key</p>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder="New API key"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    className="h-9"
                  />
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Passphrase"
                    value={passphraseSave}
                    onChange={(event) => setPassphraseSave(event.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-3 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {status.stored && status.unlocked ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={handleLock}>
                  Lock session
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleRemove}
                >
                  Remove key
                </Button>
              </>
            ) : null}
          </div>
          <div className="flex w-full justify-end gap-2 sm:w-auto">
            {!status.stored ? (
              <Button type="button" onClick={() => void handleSave()}>
                Save & unlock
              </Button>
            ) : status.unlocked ? (
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
