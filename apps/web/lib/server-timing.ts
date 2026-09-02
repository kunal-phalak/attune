export type ServerTimingRecorder = (name: string, durationMs: number) => void;

export class ServerTimingTrace {
  readonly #entries: { readonly name: string; readonly durationMs: number }[] = [];

  readonly record: ServerTimingRecorder = (name, durationMs) => {
    this.#entries.push({
      name: name.replaceAll(/[^A-Za-z0-9_-]/g, '_'),
      durationMs: Math.max(0, durationMs),
    });
  };

  header(): string {
    return this.#entries
      .map(({ name, durationMs }) => `${name};dur=${durationMs.toFixed(1)}`)
      .join(', ');
  }

  apply(response: Response): Response {
    const value = this.header();
    if (value) response.headers.set('Server-Timing', value);
    return response;
  }
}

export async function measureServerPhase<T>(
  timing: ServerTimingRecorder | undefined,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    timing?.(name, performance.now() - startedAt);
  }
}
