import type { AiModel } from "@/lib/ai/aiProviderTypes";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Loader2, Star } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface AiModelPickerProps {
  models: AiModel[];
  value: string;
  favorites: string[];
  loading: boolean;
  error: string | null;
  onValueChange: (value: string) => void;
  onToggleFavorite: (modelId: string) => void;
}

export function AiModelPicker({
  models,
  value,
  favorites,
  loading,
  error,
  onValueChange,
  onToggleFavorite,
}: AiModelPickerProps) {
  const [open, setOpen] = useState(false);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const selected = models.find((model) => model.id === value);
  const orderedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const favoriteDifference =
        Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id));
      if (favoriteDifference !== 0) return favoriteDifference;
      return a.name.localeCompare(b.name);
    });
  }, [favoriteSet, models]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={loading && models.length === 0}
          className="h-8 min-w-0 max-w-full justify-between gap-2 px-2.5 text-left text-[11px] font-normal"
          title={selected?.id ?? (value || "Choose a model")}
        >
          <span className="min-w-0 truncate">
            {loading && models.length === 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading models
              </span>
            ) : selected ? (
              selected.name
            ) : (
              value || "Choose model"
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Search all models..." />
          <CommandList className="max-h-[min(60vh,28rem)]">
            {error ? (
              <p className="px-3 py-6 text-center text-xs text-destructive">{error}</p>
            ) : (
              <CommandEmpty>No models found.</CommandEmpty>
            )}
            <CommandGroup heading={favorites.length > 0 ? "Favorites first" : "All models"}>
              {orderedModels.map((model) => {
                const favorite = favoriteSet.has(model.id);
                return (
                  <CommandItem
                    key={model.id}
                    value={`${model.name} ${model.id}`}
                    onSelect={() => {
                      onValueChange(model.id);
                      setOpen(false);
                    }}
                    className="items-start gap-2 py-2"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        value === model.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{model.name}</span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {model.id}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:text-amber-500"
                      aria-label={favorite ? `Remove ${model.name} from favorites` : `Favorite ${model.name}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(model.id);
                      }}
                    >
                      <Star className={cn("h-3.5 w-3.5", favorite && "fill-amber-400 text-amber-500")} />
                    </button>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
