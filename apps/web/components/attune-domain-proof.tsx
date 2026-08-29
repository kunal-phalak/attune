'use client';

import { useCallback, useEffect, useState } from 'react';

interface DomainView {
  readonly workspace: {
    readonly workspaceSeq: number;
    readonly draftVersion: number;
    readonly capabilityEpoch: number;
  };
  readonly validation: {
    readonly valid: boolean;
    readonly evidence: {
      readonly slotRightClearanceMm: number;
      readonly requiredSlotClearanceMm: number;
      readonly lockedMountsPreserved: number;
      readonly lockedMountsTotal: number;
    };
  };
  readonly capabilities: readonly { readonly id: string }[];
  readonly repairs: readonly { readonly id: string; readonly label: string }[];
  readonly receiptCount: number;
}

function isDomainView(value: unknown): value is DomainView {
  if (typeof value !== 'object' || value === null) return false;
  const workspace = Reflect.get(value, 'workspace');
  const validation = Reflect.get(value, 'validation');
  return (
    typeof workspace === 'object' &&
    workspace !== null &&
    Number.isInteger(Reflect.get(workspace, 'workspaceSeq')) &&
    typeof validation === 'object' &&
    validation !== null
  );
}

async function fetchDomainView(
  path = '/api/attune/human',
  init?: RequestInit,
): Promise<DomainView> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, cache: 'no-store', headers });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error(`Authoritative command rejected with ${response.status}.`);
  if (!isDomainView(payload)) throw new TypeError('Attune returned an invalid domain view.');
  return payload;
}

function DomainCards({ view }: { readonly view: DomainView }) {
  const evidence = view.validation.evidence;
  return (
    <div className="domain-grid">
      <article className="domain-card domain-conflict">
        <span>{view.validation.valid ? 'Buildable' : 'Hard conflict'}</span>
        <strong>
          {evidence.slotRightClearanceMm} <small>mm</small>
        </strong>
        <p>Required slot clearance · {evidence.requiredSlotClearanceMm} mm</p>
      </article>
      <article className="domain-card">
        <span>Intent preserved</span>
        <strong>
          {evidence.lockedMountsPreserved} / {evidence.lockedMountsTotal}
        </strong>
        <p>Buyer-locked mounts unchanged</p>
      </article>
      <article className="domain-card domain-sequence">
        <span>Authoritative cursors</span>
        <dl>
          <div>
            <dt>Workspace</dt>
            <dd>{view.workspace.workspaceSeq}</dd>
          </div>
          <div>
            <dt>Draft</dt>
            <dd>r{view.workspace.draftVersion}</dd>
          </div>
          <div>
            <dt>Epoch</dt>
            <dd>{view.workspace.capabilityEpoch}</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

function RepairFrontier({
  view,
  applying,
  onRepair,
}: {
  readonly view: DomainView;
  readonly applying: boolean;
  readonly onRepair: (repairId: string) => void;
}) {
  return (
    <div className="repair-row">
      <div>
        <span className="repair-label">Compiled capability frontier</span>
        <p>{view.capabilities.map(({ id }) => id).join(' · ') || 'No action currently valid'}</p>
      </div>
      <div className="repair-actions">
        {view.repairs.map((repair) => (
          <button
            type="button"
            key={repair.id}
            disabled={applying}
            onClick={() => onRepair(repair.id)}
          >
            {repair.label}
          </button>
        ))}
        {view.validation.valid ? (
          <span className="valid-state">Validated · {view.receiptCount} receipt</span>
        ) : null}
      </div>
    </div>
  );
}

export function AttuneDomainProof() {
  const [view, setView] = useState<DomainView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'applying' | 'failed'>('loading');
  const refresh = useCallback(async () => {
    try {
      setView(await fetchDomainView());
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const reload = () => void refresh();
    window.addEventListener('attune:workspace-changed', reload);
    return () => window.removeEventListener('attune:workspace-changed', reload);
  }, [refresh]);

  async function applyRepair(repairId: string) {
    if (!view) return;
    setState('applying');
    try {
      const next = await fetchDomainView('/api/attune/human', {
        method: 'POST',
        body: JSON.stringify({
          repairId,
          commandId: `human-${crypto.randomUUID()}`,
          expectedWorkspaceSeq: view.workspace.workspaceSeq,
          expectedCapabilityEpoch: view.workspace.capabilityEpoch,
        }),
      });
      setView(next);
      setState('ready');
      window.dispatchEvent(new Event('attune:workspace-changed'));
    } catch {
      setState('failed');
      await refresh();
    }
  }

  if (!view) {
    return (
      <p className="domain-loading">
        {state === 'failed' ? 'State unavailable' : 'Loading state…'}
      </p>
    );
  }

  return (
    <section className="domain-proof" aria-labelledby="domain-proof-title">
      <div className="domain-proof-heading">
        <p className="section-index">01 / AUTHORITATIVE DOMAIN</p>
        <h2 id="domain-proof-title">AT-1042, now executable.</h2>
        <p>
          This is live command-bus state—not an editor mock. Human controls and WebMCP tools write
          through the same validated transition path.
        </p>
      </div>
      <DomainCards view={view} />
      <RepairFrontier
        view={view}
        applying={state === 'applying'}
        onRepair={(repairId) => void applyRepair(repairId)}
      />
    </section>
  );
}
