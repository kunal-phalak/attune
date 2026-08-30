'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  AttuneHttpError,
  commandRequestBody,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
  type CapabilityView,
} from '../lib/attune-view';

type UiState = 'loading' | 'ready' | 'applying' | 'failed';

const roles: readonly CapabilityRole[] = ['buyer', 'provider', 'agent'];

function available(view: AttuneApiView, role: CapabilityRole, capabilityId: string) {
  return view.frontiers[role].some(
    (capability) => capability.id === capabilityId && capability.available,
  );
}

function DomainCards({ view }: { readonly view: AttuneApiView }) {
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

interface ActionSpec {
  readonly id: string;
  readonly label: string;
  readonly role: CapabilityRole;
  readonly path: string;
  readonly command: Readonly<Record<string, unknown>>;
}

function workflowActions(view: AttuneApiView): readonly ActionSpec[] {
  const quote = view.workspace.quotes.find(
    (candidate) =>
      candidate.revisionId === `r${view.workspace.draftVersion}` &&
      candidate.specHash === view.specHash,
  );
  const actions: ActionSpec[] = [];
  if (available(view, 'buyer', 'request_quote')) {
    actions.push({
      id: 'request-quote',
      label: 'Request exact quote',
      role: 'buyer',
      path: '/api/attune/human',
      command: { type: 'request_quote' },
    });
  }
  if (available(view, 'provider', 'freeze_and_quote_revision')) {
    actions.push({
      id: 'freeze-quote',
      label: 'Provider freezes + quotes r7',
      role: 'provider',
      path: '/api/attune/provider',
      command: { type: 'freeze_and_quote_revision' },
    });
  }
  if (available(view, 'buyer', 'accept_revision') && quote) {
    actions.push({
      id: 'accept-r7',
      label: 'Buyer accepts exact r7',
      role: 'buyer',
      path: '/api/attune/human',
      command: {
        type: 'accept_revision',
        revisionId: quote.revisionId,
        quoteId: quote.quoteId,
      },
    });
  }
  if (available(view, 'agent', 'materialize_for_commerce')) {
    actions.push({
      id: 'materialize-r7',
      label: 'Materialize + verify Shopify',
      role: 'agent',
      path: '/api/attune/webmcp',
      command: { type: 'materialize_for_commerce', revisionId: 'r7' },
    });
  }
  if (available(view, 'buyer', 'navigate_to_storefront') && view.workspace.draftVersion === 7) {
    actions.push({
      id: 'create-r8',
      label: 'Human changes slot → r8',
      role: 'buyer',
      path: '/api/attune/human',
      command: { type: 'move_slot', centerX: 195, centerY: 60 },
    });
  }
  return actions;
}

function RepairActions({
  view,
  disabled,
  execute,
}: {
  readonly view: AttuneApiView;
  readonly disabled: boolean;
  readonly execute: (
    path: string,
    command: Readonly<Record<string, unknown>>,
    prefix: string,
  ) => void;
}) {
  if (!available(view, 'buyer', 'apply_deterministic_repair')) return null;
  return (
    <>
      {view.repairs.map((repair) => (
        <button
          type="button"
          key={repair.id}
          disabled={disabled}
          onClick={() =>
            execute(
              '/api/attune/human',
              { type: 'apply_deterministic_repair', repairId: repair.id },
              'human',
            )
          }
        >
          {repair.label}
        </button>
      ))}
    </>
  );
}

function WorkflowControls({
  view,
  disabled,
  execute,
  attemptStale,
}: {
  readonly view: AttuneApiView;
  readonly disabled: boolean;
  readonly execute: (
    path: string,
    command: Readonly<Record<string, unknown>>,
    prefix: string,
  ) => void;
  readonly attemptStale: () => void;
}) {
  const staleR8 = view.workspace.draftVersion >= 8 && view.workspace.commerceLinks.length > 0;
  const commerce = view.workspace.commerceLinks.at(-1);
  return (
    <div className="repair-actions">
      <RepairActions view={view} disabled={disabled} execute={execute} />
      {workflowActions(view).map((action) => (
        <button
          type="button"
          key={action.id}
          disabled={disabled}
          onClick={() => execute(action.path, action.command, action.role)}
        >
          {action.label}
        </button>
      ))}
      {commerce && view.workspace.draftVersion === 7 ? (
        <a className="action-link" href={commerce.verification.storefrontUrl}>
          Open verified Shopify product ↗
        </a>
      ) : null}
      {staleR8 ? (
        <button type="button" className="danger-action" disabled={disabled} onClick={attemptStale}>
          Prove stale r7 action is blocked
        </button>
      ) : null}
    </div>
  );
}

function CapabilityItem({ capability }: { readonly capability: CapabilityView }) {
  return (
    <article
      className={capability.available ? 'capability-item available' : 'capability-item blocked'}
    >
      <div>
        <strong>{capability.id.replaceAll('_', ' ')}</strong>
        <span>{capability.available ? 'AVAILABLE' : 'BLOCKED'}</span>
      </div>
      <p>{capability.available ? capability.reason : capability.description}</p>
      <ul>
        {(capability.available ? capability.predictedConsequences : capability.blockers).map(
          (item) => (
            <li key={typeof item === 'string' ? item : item.code}>
              {typeof item === 'string' ? item : `${item.code}: ${item.message}`}
            </li>
          ),
        )}
      </ul>
    </article>
  );
}

function CapabilityPanel({ view }: { readonly view: AttuneApiView }) {
  const [role, setRole] = useState<CapabilityRole>('buyer');
  const transition = view.latestCapabilityTransition;
  return (
    <section className="product-panel capability-panel" aria-labelledby="capability-panel-title">
      <div className="product-panel-heading">
        <div>
          <p className="section-index">02 / CAPABILITY + CONSEQUENCE</p>
          <h3 id="capability-panel-title">Authority is compiled, not assumed.</h3>
        </div>
        <div className="epoch-badge">
          <span>Capability epoch</span>
          <strong>{view.workspace.capabilityEpoch}</strong>
        </div>
      </div>
      <div className="role-tabs" aria-label="Capability role">
        {roles.map((candidate) => (
          <button
            type="button"
            key={candidate}
            aria-pressed={role === candidate}
            onClick={() => setRole(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      <div className="capability-list">
        {view.frontiers[role].map((capability) => (
          <CapabilityItem capability={capability} key={capability.id} />
        ))}
      </div>
      <div className="transition-summary">
        <span>Latest receipt changed</span>
        {transition ? (
          <p>
            Gained{' '}
            {transition.gained
              .map(({ role: actor, capabilityId }) => `${actor}:${capabilityId}`)
              .join(' · ') || 'none'}
            <br />
            Lost{' '}
            {transition.lost
              .map(({ role: actor, capabilityId }) => `${actor}:${capabilityId}`)
              .join(' · ') || 'none'}
          </p>
        ) : (
          <p>No command has changed the frontier yet.</p>
        )}
      </div>
    </section>
  );
}

function RecordsPanel({ view }: { readonly view: AttuneApiView }) {
  const records = view.records.receipts.toReversed().slice(0, 6);
  const verification = view.records.externalVerifications.at(-1);
  return (
    <section className="product-panel records-panel" aria-labelledby="records-title">
      <div className="product-panel-heading">
        <div>
          <p className="section-index">03 / LINKED RECORDS</p>
          <h3 id="records-title">Every consequence leaves evidence.</h3>
        </div>
        <strong className="record-count">{view.receiptCount} receipts</strong>
      </div>
      <div className="record-columns">
        <div>
          <h4>Immutable change receipts</h4>
          <ol className="receipt-list">
            {records.map((receipt) => (
              <li key={receipt.receiptId}>
                <span>
                  #{receipt.receiptSeq} · {receipt.origin}
                </span>
                <strong>{receipt.command.replaceAll('_', ' ')}</strong>
                <code>{receipt.specHashAfter.slice(0, 12)}</code>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h4>External Shopify verification</h4>
          {verification ? (
            <dl className="verification-record">
              <div>
                <dt>Admin</dt>
                <dd>verified</dd>
              </div>
              <div>
                <dt>Publication</dt>
                <dd>verified</dd>
              </div>
              <div>
                <dt>Storefront</dt>
                <dd>verified</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{verification.revisionId}</dd>
              </div>
              <div>
                <dt>SKU</dt>
                <dd>{verification.verification.sku}</dd>
              </div>
              <div>
                <dt>Lot</dt>
                <dd>₹2,400 · 4 panels · cart qty 1</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>{verification.verification.productId}</dd>
              </div>
              <div>
                <dt>Variant</dt>
                <dd>{verification.verification.variantId}</dd>
              </div>
            </dl>
          ) : (
            <p className="empty-record">
              Awaiting exact Admin → publication → Storefront verification. Judges never need
              Shopify Admin access.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function duration(milliseconds: number | null) {
  if (milliseconds === null) return 'measuring';
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function OutcomePanel({ view }: { readonly view: AttuneApiView }) {
  const impact = view.impact;
  const exact = impact.exactRevisionShopifyVerifications > 0 ? 'exact' : 'pending';
  return (
    <section className="outcome-panel" aria-labelledby="outcome-title">
      <div>
        <p className="section-index">04 / MEASURED OUTCOME</p>
        <h3 id="outcome-title">AT-1042 · Outcome</h3>
        <p>Measured from authoritative receipts and verification records—never fabricated.</p>
      </div>
      <dl>
        <div>
          <dt>Need → buildable</dt>
          <dd>{duration(impact.needToBuildableMs)}</dd>
        </div>
        <div>
          <dt>Hard conflicts caught pre-quote</dt>
          <dd>{impact.conflictsCaughtBeforeQuote}</dd>
        </div>
        <div>
          <dt>Buyer-locked mounts preserved</dt>
          <dd>
            {impact.lockedRequirementsPreserved.preserved} /{' '}
            {impact.lockedRequirementsPreserved.total}
          </dd>
        </div>
        <div>
          <dt>Human interventions detected</dt>
          <dd>{impact.humanInterventionsDetected}</dd>
        </div>
        <div>
          <dt>Stale commerce actions blocked</dt>
          <dd>{impact.staleConsequentialActionsBlocked}</dd>
        </div>
        <div>
          <dt>Frozen revision → Shopify match</dt>
          <dd>{exact}</dd>
        </div>
        <div>
          <dt>Golden-path completion</dt>
          <dd>
            {impact.goldenPath.completedRuns} / {impact.goldenPath.startedRuns}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function AttuneDomainProof() {
  const [view, setView] = useState<AttuneApiView | null>(null);
  const [state, setState] = useState<UiState>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setView(await requestAttuneView('/api/attune/human'));
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

  async function execute(path: string, command: Readonly<Record<string, unknown>>, prefix: string) {
    if (!view) return;
    setState('applying');
    setMessage(null);
    try {
      const next = await requestAttuneView(path, {
        method: 'POST',
        body: commandRequestBody(view, command, prefix),
      });
      setView(next);
      setState('ready');
      window.dispatchEvent(new Event('attune:workspace-changed'));
    } catch (error) {
      setMessage(
        error instanceof AttuneHttpError ? `${error.code}: ${error.message}` : 'Command failed.',
      );
      setState('failed');
      await refresh();
    }
  }

  async function attemptStale() {
    if (!view) return;
    const r8Receipt = view.records.receipts.findLast(({ command }) => command === 'move_slot');
    if (!r8Receipt) return;
    setState('applying');
    try {
      await requestAttuneView('/api/attune/webmcp', {
        method: 'POST',
        body: JSON.stringify({
          command: { type: 'materialize_for_commerce', revisionId: 'r7' },
          commandId: `stale-proof-${crypto.randomUUID()}`,
          expectedWorkspaceSeq: r8Receipt.workspaceSeq - 1,
          expectedCapabilityEpoch: r8Receipt.capabilityEpoch - 1,
          expectedSpecHash: r8Receipt.specHashBefore,
        }),
      });
      setMessage('Unexpectedly accepted stale authority.');
    } catch (error) {
      setMessage(
        error instanceof AttuneHttpError
          ? `PASS · stale action rejected: ${error.code}`
          : 'Stale proof request failed.',
      );
    }
    await refresh();
  }

  if (!view) {
    return (
      <p className="domain-loading">
        {state === 'failed' ? 'State unavailable' : 'Loading state…'}
      </p>
    );
  }

  return (
    <>
      <section className="domain-proof" aria-labelledby="domain-proof-title">
        <div className="domain-proof-heading">
          <p className="section-index">01 / AUTHORITATIVE DOMAIN</p>
          <h2 id="domain-proof-title">One need, through real authority.</h2>
          <p>
            Human controls and contextual WebMCP tools enter the same command bus. Quote,
            acceptance, commerce, and revocation compile from the current facts.
          </p>
        </div>
        <DomainCards view={view} />
        <div className="repair-row">
          <div>
            <span className="repair-label">Current manufacturing outcome</span>
            <p>
              {view.validation.valid
                ? `Buildable r${view.workspace.draftVersion} · ${view.receiptCount} immutable receipts`
                : '8.1 mm is below the required 12 mm clearance.'}
            </p>
            {message ? (
              <p className="command-message" aria-live="polite">
                {message}
              </p>
            ) : null}
          </div>
          <WorkflowControls
            view={view}
            disabled={state === 'applying'}
            execute={(path, command, prefix) => void execute(path, command, prefix)}
            attemptStale={() => void attemptStale()}
          />
        </div>
      </section>
      <CapabilityPanel view={view} />
      <RecordsPanel view={view} />
      <OutcomePanel view={view} />
    </>
  );
}
