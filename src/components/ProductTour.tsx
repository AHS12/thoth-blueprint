import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface ProductTourStep {
    id: string;
    title: string;
    description: string;
    target: string;
    placement?: "top" | "right" | "bottom" | "left";
}

interface ProductTourProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    steps: ProductTourStep[];
    onComplete?: () => void;
    onSkip?: () => void;
}

type Rect = { top: number; left: number; width: number; height: number };
type Size = { width: number; height: number };
type Position = { top: number; left: number };

const EMPTY_RECT: Rect = { top: 0, left: 0, width: 0, height: 0 };
const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 14;

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}

function fitsInViewport(position: Position, size: Size, viewport: Size) {
    return (
        position.left >= VIEWPORT_PADDING &&
        position.top >= VIEWPORT_PADDING &&
        position.left + size.width <= viewport.width - VIEWPORT_PADDING &&
        position.top + size.height <= viewport.height - VIEWPORT_PADDING
    );
}

function placementOrder(preferred: ProductTourStep["placement"]) {
    switch (preferred) {
        case "top":
            return ["top", "bottom", "right", "left"] as const;
        case "left":
            return ["left", "right", "bottom", "top"] as const;
        case "right":
            return ["right", "left", "bottom", "top"] as const;
        default:
            return ["bottom", "top", "right", "left"] as const;
    }
}

function positionForPlacement(targetRect: Rect, tooltipSize: Size, placement: ProductTourStep["placement"]): Position {
    switch (placement) {
        case "top":
            return {
                top: targetRect.top - tooltipSize.height - TOOLTIP_GAP,
                left: targetRect.left + targetRect.width / 2 - tooltipSize.width / 2,
            };
        case "left":
            return {
                top: targetRect.top + targetRect.height / 2 - tooltipSize.height / 2,
                left: targetRect.left - tooltipSize.width - TOOLTIP_GAP,
            };
        case "right":
            return {
                top: targetRect.top + targetRect.height / 2 - tooltipSize.height / 2,
                left: targetRect.left + targetRect.width + TOOLTIP_GAP,
            };
        default:
            return {
                top: targetRect.top + targetRect.height + TOOLTIP_GAP,
                left: targetRect.left + targetRect.width / 2 - tooltipSize.width / 2,
            };
    }
}

function getDesktopTooltipPosition(targetRect: Rect, tooltipSize: Size, viewport: Size, preferred?: ProductTourStep["placement"]): Position {
    const orderedPlacements = placementOrder(preferred);

    for (const placement of orderedPlacements) {
        const candidate = positionForPlacement(targetRect, tooltipSize, placement);
        if (fitsInViewport(candidate, tooltipSize, viewport)) {
            return candidate;
        }
    }

    const fallback = positionForPlacement(targetRect, tooltipSize, preferred ?? "bottom");
    return {
        top: clamp(fallback.top, VIEWPORT_PADDING, viewport.height - tooltipSize.height - VIEWPORT_PADDING),
        left: clamp(fallback.left, VIEWPORT_PADDING, viewport.width - tooltipSize.width - VIEWPORT_PADDING),
    };
}

export function ProductTour({
    isOpen,
    onOpenChange,
    steps,
    onComplete,
    onSkip,
}: ProductTourProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [targetRect, setTargetRect] = useState<Rect>(EMPTY_RECT);
    const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 });
    const [tooltipPosition, setTooltipPosition] = useState<Position | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    const currentStep = useMemo(() => steps[currentIndex], [steps, currentIndex]);

    useEffect(() => {
        if (!isOpen) return;
        setCurrentIndex(0);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleResize = () => {
            setViewportSize({ width: window.innerWidth, height: window.innerHeight });
        };

        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !currentStep) return;

        const updateRect = () => {
            const targetEl = document.querySelector(currentStep.target);
            if (!(targetEl instanceof HTMLElement)) {
                setTargetRect(EMPTY_RECT);
                return;
            }

            targetEl.scrollIntoView({ behavior: viewportSize.width <= 1024 ? "auto" : "smooth", block: "center", inline: "nearest" });
            const rect = targetEl.getBoundingClientRect();
            setTargetRect({
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            });
        };

        updateRect();
        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, true);

        return () => {
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, true);
        };
    }, [isOpen, currentStep, viewportSize.width]);

    const isCompactLayout = viewportSize.width > 0 && viewportSize.width <= 1024;

    useLayoutEffect(() => {
        if (!isOpen || isCompactLayout) {
            setTooltipPosition(null);
            return;
        }

        const tooltipEl = tooltipRef.current;
        if (!tooltipEl) return;

        const tooltipRect = tooltipEl.getBoundingClientRect();
        const tooltipSize: Size = { width: tooltipRect.width, height: tooltipRect.height };
        const viewport: Size = {
            width: viewportSize.width || window.innerWidth,
            height: viewportSize.height || window.innerHeight,
        };

        const hasTarget = targetRect.width > 0 && targetRect.height > 0;

        if (!hasTarget) {
            setTooltipPosition({
                top: clamp(viewport.height / 2 - tooltipSize.height / 2, VIEWPORT_PADDING, viewport.height - tooltipSize.height - VIEWPORT_PADDING),
                left: clamp(viewport.width / 2 - tooltipSize.width / 2, VIEWPORT_PADDING, viewport.width - tooltipSize.width - VIEWPORT_PADDING),
            });
            return;
        }

        setTooltipPosition(getDesktopTooltipPosition(targetRect, tooltipSize, viewport, currentStep?.placement));
    }, [isOpen, isCompactLayout, targetRect, viewportSize, currentStep]);

    if (!isOpen || !currentStep) return null;

    const isLastStep = currentIndex === steps.length - 1;
    const showHighlight = targetRect.width > 0 && targetRect.height > 0;

    const closeTour = () => {
        onOpenChange(false);
    };

    const skipTour = () => {
        onSkip?.();
        closeTour();
    };

    const goNext = () => {
        if (isLastStep) {
            onComplete?.();
            closeTour();
            return;
        }
        setCurrentIndex((prev) => prev + 1);
    };

    return (
        <div className="fixed inset-0 z-[1200]">
            <div className="absolute inset-0 bg-black/55" />

            {showHighlight && (
                <div
                    className="absolute rounded-xl ring-2 ring-primary/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-all"
                    style={{
                        top: targetRect.top - 6,
                        left: targetRect.left - 6,
                        width: targetRect.width + 12,
                        height: targetRect.height + 12,
                    }}
                />
            )}

            <div
                className={cn(
                    "rounded-lg border bg-background p-4 shadow-xl",
                    isCompactLayout
                        ? "fixed bottom-3 left-3 right-3 z-[1201] max-h-[75vh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
                        : "absolute z-[1201] w-[min(92vw,24rem)]"
                )}
                style={!isCompactLayout && tooltipPosition ? { top: tooltipPosition.top, left: tooltipPosition.left } : undefined}
                ref={tooltipRef}
            >
                <p className="text-xs font-medium text-muted-foreground">
                    Step {currentIndex + 1} of {steps.length}
                </p>
                <h3 className="mt-1 text-base font-semibold">{currentStep.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{currentStep.description}</p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" onClick={skipTour}>
                        Skip
                    </Button>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                            disabled={currentIndex === 0}
                        >
                            Back
                        </Button>
                        <Button size="sm" onClick={goNext}>
                            {isLastStep ? "Finish" : "Next"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
