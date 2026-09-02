export interface PreviewToken {
  readonly dragSessionId: string;
  readonly generation: number;
}

function sameToken(first: PreviewToken, second: PreviewToken): boolean {
  return first.dragSessionId === second.dragSessionId && first.generation === second.generation;
}

/** One in-flight solve plus one replaceable desired target; no pointer-event backlog can form. */
export class LatestPreviewQueue<Request extends PreviewToken, Result extends PreviewToken> {
  #latest: Request | null = null;
  #inFlight: Request | null = null;

  constructor(
    private readonly dispatch: (request: Request) => void,
    private readonly accept: (result: Result) => void,
  ) {}

  enqueue(request: Request): void {
    this.#latest = request;
    if (!this.#inFlight) this.#start(request);
  }

  resolve(result: Result): void {
    if (!this.#inFlight || !sameToken(this.#inFlight, result)) return;
    const accepted = this.#latest && sameToken(this.#latest, result);
    this.#inFlight = null;
    if (accepted) this.accept(result);
    if (this.#latest && !sameToken(this.#latest, result)) this.#start(this.#latest);
  }

  reject(token: PreviewToken): void {
    if (!this.#inFlight || !sameToken(this.#inFlight, token)) return;
    this.#inFlight = null;
    if (this.#latest && !sameToken(this.#latest, token)) this.#start(this.#latest);
  }

  cancel(dragSessionId: string): void {
    if (this.#latest?.dragSessionId === dragSessionId) this.#latest = null;
  }

  snapshot(): { readonly inFlight: PreviewToken | null; readonly latest: PreviewToken | null } {
    return { inFlight: this.#inFlight, latest: this.#latest };
  }

  #start(request: Request): void {
    this.#inFlight = request;
    this.dispatch(request);
  }
}
