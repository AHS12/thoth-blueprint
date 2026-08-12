type RetryOptions = {
  maxRetries?: number;
  onRetry?: (attempt: number, error: unknown) => void;
};

function statusFromError(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { status?: unknown; response?: { status?: unknown } };
  if (typeof value.status === "number") return value.status;
  return typeof value.response?.status === "number"
    ? value.response.status
    : undefined;
}

function isTransientError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  const status = statusFromError(error);
  if (status !== undefined) {
    return status === 408 || status === 429 || status >= 500;
  }
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network|timeout|temporarily unavailable|\b(408|429|500|502|503|504)\b/iu.test(
    message,
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function retryAiRequest<T>(
  request: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;

  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= maxRetries || !isTransientError(error)) throw error;
      const retryAttempt = attempt + 1;
      options.onRetry?.(retryAttempt, error);
      const delay = Math.min(4000, 500 * 2 ** attempt) + Math.round(Math.random() * 250);
      await wait(delay);
    }
  }
}
