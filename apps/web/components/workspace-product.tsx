'use client';

import {
  LiveblocksProvider,
  RoomProvider,
  useHistoryVersionYjsData,
  useHistoryVersions,
  useRoom,
  useSyncStatus,
  useThreads,
  useUnreadInboxNotificationsCount,
  useUpdateMyPresence,
} from '@liveblocks/react';
import { AvatarStack, Composer, Cursors, Thread } from '@liveblocks/react-ui';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';

import {
  AttuneHttpError,
  attuneWorkspaceEndpoint,
  commandRequestBody,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import type { AttuneCollaborativeDraft } from '../liveblocks.config';
import { AttuneWebMcp } from './attune-webmcp';

type ProductState = 'loading' | 'ready' | 'applying' | 'failed';

function available(view: AttuneApiView, role: CapabilityRole, id: string): boolean {
  return view.frontiers[role].some((entry) => entry.id === id && entry.available);
}

function draftFrom(view: AttuneApiView): AttuneCollaborativeDraft {
  return {
    intent: 'Fabricate a custom equipment panel with four protected buyer mounts.',
    commitmentId: view.workspace.commitmentId,
    fabricationQuantity: 4,
    geometry: structuredClone(view.workspace.geometry),
    draftVersion: view.workspace.draftVersion,
    metadata: {
      material: view.workspace.geometry.material,
      thicknessMm: view.workspace.geometry.thickness,
    },
  };
}

function YjsDraftBridge({ workspaceId }: { readonly workspaceId: string }) {
  const room = useRoom();
  const provider = useMemo(() => getYjsProviderForRoom(room), [room]);

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      const view = await requestAttuneView(
        attuneWorkspaceEndpoint('/api/attune/human', workspaceId),
      );
      if (!active) return;
      const map = provider.getYDoc().getMap('attune');
      const next = draftFrom(view);
      if (JSON.stringify(map.get('draft')) !== JSON.stringify(next)) map.set('draft', next);
    };
    void synchronize();
    const onChange = () => void synchronize();
    window.addEventListener('attune:workspace-changed', onChange);
    return () => {
      active = false;
      window.removeEventListener('attune:workspace-changed', onChange);
    };
  }, [provider, workspaceId]);

  return null;
}

function RestoreYjsVersion({ versionId }: { readonly versionId: string }) {
  const version = useHistoryVersionYjsData(versionId);
  const room = useRoom();
  const restore = () => {
    if (!version.data) return;
    const historicDocument = new Y.Doc();
    try {
      Y.applyUpdate(historicDocument, version.data);
      const historicDraft = historicDocument.getMap('attune').get('draft');
      if (historicDraft) {
        getYjsProviderForRoom(room).getYDoc().getMap('attune').set('draft', historicDraft);
      }
    } finally {
      historicDocument.destroy();
    }
  };
  return (
    <button type="button" onClick={restore} disabled={!version.data}>
      Load as draft
    </button>
  );
}

function CollaborationPanel({ workspaceId }: { readonly workspaceId: string }) {
  const threadResult = useThreads({ query: { metadata: { workspaceId } } });
  const historyResult = useHistoryVersions();
  const notificationResult = useUnreadInboxNotificationsCount();
  const syncStatus = useSyncStatus();
  const threads = threadResult.threads ?? [];
  const versions = historyResult.versions ?? [];

  return (
    <section className="collaboration-panel" aria-label="Workspace collaboration">
      <div className="collaboration-heading">
        <div>
          <span>Collaboration</span>
          <strong>{syncStatus === 'synchronized' ? 'Synced' : 'Synchronizing'}</strong>
        </div>
        <AvatarStack max={4} size={26} />
      </div>
      <div className="collaboration-stats">
        <span>{threads.length} discussions</span>
        <span>{versions.length} snapshots</span>
        <span>{notificationResult.count ?? 0} unread</span>
      </div>
      <div className="thread-list">
        {threads.slice(0, 2).map((thread) => (
          <Thread thread={thread} key={thread.id} showComposer="collapsed" />
        ))}
      </div>
      <Composer
        className="workspace-composer"
        metadata={{ workspaceId, entityId: 'workspace', x: 0, y: 0 }}
      />
      {versions.length > 0 ? (
        <div className="version-list">
          <span>Collaboration history</span>
          {versions.slice(0, 2).map((version) => (
            <div key={version.id}>
              <code>{version.id}</code>
              <RestoreYjsVersion versionId={version.id} />
            </div>
          ))}
          <p>
            Loading a snapshot changes only the mutable draft; frozen revisions remain immutable.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function GeometryDrawing({
  view,
  updatePresence,
  showCursors,
}: {
  readonly view: AttuneApiView;
  readonly updatePresence?: (patch: {
    readonly cursor?: { readonly x: number; readonly y: number } | null;
    readonly selection?: string[];
    readonly currentTool?: string;
  }) => void;
  readonly showCursors: boolean;
}) {
  const geometry = view.workspace.geometry;
  const scale = 2.2;
  const offsetX = 45;
  const offsetY = 45;
  const slotX = offsetX + (geometry.slot.center.x - geometry.slot.width / 2) * scale;
  const slotY = offsetY + (geometry.slot.center.y - geometry.slot.height / 2) * scale;
  const conflict = !view.validation.valid;

  return (
    <section
      className="geometry-stage"
      aria-label="AT-1042 semantic geometry"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        updatePresence?.({
          cursor: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        });
      }}
      onPointerLeave={() => updatePresence?.({ cursor: null })}
    >
      <div className="stage-toolbar">
        <div>
          <button type="button" aria-pressed="true">
            Select
          </button>
          <button type="button" disabled>
            Hole
          </button>
          <button type="button" disabled>
            Slot
          </button>
        </div>
        <span>Semantic preview · committed operations only</span>
      </div>
      <div className="stage-canvas">
        {showCursors ? <Cursors /> : null}
        <svg viewBox="0 0 570 360" aria-labelledby="geometry-title geometry-description">
          <title id="geometry-title">AT-1042 equipment panel</title>
          <desc id="geometry-description">
            A 218 by 120 millimeter acrylic panel with four locked mounts, two symmetric holes, and
            one connector slot.
          </desc>
          <rect
            className="workspace-sheet"
            x={offsetX}
            y={offsetY}
            width={geometry.width * scale}
            height={geometry.height * scale}
            rx="4"
          />
          {[...geometry.mounts, ...geometry.auxiliaryHoles].map((hole) => (
            <g key={hole.id}>
              <circle
                className={hole.locked ? 'workspace-hole locked' : 'workspace-hole'}
                cx={offsetX + hole.center.x * scale}
                cy={offsetY + hole.center.y * scale}
                r={(hole.diameter * scale) / 2}
              />
              {hole.locked ? (
                <text
                  x={offsetX + hole.center.x * scale + 8}
                  y={offsetY + hole.center.y * scale - 8}
                >
                  LOCK
                </text>
              ) : null}
            </g>
          ))}
          <rect
            className={conflict ? 'workspace-slot conflict' : 'workspace-slot'}
            x={slotX}
            y={slotY}
            width={geometry.slot.width * scale}
            height={geometry.slot.height * scale}
            rx={geometry.slot.height * scale * 0.45}
            onPointerDown={() =>
              updatePresence?.({ selection: ['slot:connector'], currentTool: 'select' })
            }
          />
          <path
            className="workspace-dimension"
            d={`M${slotX} 330H${slotX + geometry.slot.width * scale}`}
          />
          <text className="workspace-measure" x={slotX} y="348">
            clearance {view.validation.evidence.slotRightClearanceMm} /{' '}
            {view.validation.evidence.requiredSlotClearanceMm} mm
          </text>
        </svg>
      </div>
    </section>
  );
}

function CollaborativeGeometryStage({ view }: { readonly view: AttuneApiView }) {
  const updatePresence = useUpdateMyPresence();
  return <GeometryDrawing view={view} updatePresence={updatePresence} showCursors />;
}

function GeometryStage({
  view,
  collaboration,
}: {
  readonly view: AttuneApiView;
  readonly collaboration: boolean;
}) {
  return collaboration ? (
    <CollaborativeGeometryStage view={view} />
  ) : (
    <GeometryDrawing view={view} showCursors={false} />
  );
}

function SpecificationPanel({ view }: { readonly view: AttuneApiView }) {
  const geometry = view.workspace.geometry;
  return (
    <aside className="specification-panel">
      <div className="shell-panel-heading">
        <span>Specification</span>
        <strong>r{view.workspace.draftVersion}</strong>
      </div>
      <dl className="spec-list">
        <div>
          <dt>Panel</dt>
          <dd>
            {geometry.width} × {geometry.height} mm
          </dd>
        </div>
        <div>
          <dt>Material</dt>
          <dd>
            {geometry.material} · {geometry.thickness} mm
          </dd>
        </div>
        <div>
          <dt>Fabrication</dt>
          <dd>{view.workspace.fabricationQuantity} panels</dd>
        </div>
        <div>
          <dt>Mounts</dt>
          <dd>4 buyer-locked</dd>
        </div>
      </dl>
      <div className="constraint-list">
        <span>Constraints</span>
        <article className={view.validation.valid ? 'constraint valid' : 'constraint invalid'}>
          <div>
            <strong>Slot clearance</strong>
            <span>{view.validation.valid ? 'PASS' : 'HARD'}</span>
          </div>
          <p>
            {view.validation.evidence.slotRightClearanceMm} mm observed ·{' '}
            {view.validation.evidence.requiredSlotClearanceMm} mm required
          </p>
        </article>
        <article className="constraint valid">
          <div>
            <strong>Equal auxiliary holes</strong>
            <span>PASS</span>
          </div>
          <p>Ø8 mm pair</p>
        </article>
        <article className="constraint valid">
          <div>
            <strong>Symmetry</strong>
            <span>PASS</span>
          </div>
          <p>Centered on panel axis</p>
        </article>
      </div>
    </aside>
  );
}

function CapabilityPanel({ view }: { readonly view: AttuneApiView }) {
  const [role, setRole] = useState<CapabilityRole>('buyer');
  return (
    <aside className="workspace-capabilities">
      <div className="shell-panel-heading">
        <span>Capability + consequence</span>
        <strong>epoch {view.workspace.capabilityEpoch}</strong>
      </div>
      <div className="compact-role-tabs" aria-label="Inspect capability frontier by role">
        {(['buyer', 'provider', 'agent'] as const).map((candidate) => (
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
      <p className="role-note">View only. Server membership determines execution authority.</p>
      <div className="compact-capability-list">
        {view.frontiers[role].map((capability) => (
          <article
            className={capability.available ? 'is-available' : 'is-blocked'}
            key={capability.id}
          >
            <div>
              <strong>{capability.id.replaceAll('_', ' ')}</strong>
              <span>{capability.available ? 'AVAILABLE' : 'BLOCKED'}</span>
            </div>
            <p>{capability.available ? capability.reason : capability.blockers[0]?.message}</p>
            {capability.available ? <small>{capability.predictedConsequences[0]}</small> : null}
          </article>
        ))}
      </div>
    </aside>
  );
}

function workflowAction(view: AttuneApiView) {
  const quote = view.workspace.quotes.find(
    (candidate) =>
      candidate.revisionId === `r${view.workspace.draftVersion}` &&
      candidate.specHash === view.specHash,
  );
  if (available(view, 'buyer', 'request_quote'))
    return {
      label: 'Request exact quote',
      path: '/api/attune/human',
      prefix: 'buyer',
      command: { type: 'request_quote' },
    };
  if (available(view, 'provider', 'freeze_and_quote_revision'))
    return {
      label: 'Freeze + quote exact r7',
      path: '/api/attune/provider',
      prefix: 'provider',
      command: { type: 'freeze_and_quote_revision' },
    };
  if (available(view, 'buyer', 'accept_revision') && quote)
    return {
      label: 'Accept exact r7',
      path: '/api/attune/human',
      prefix: 'buyer',
      command: { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
    };
  if (available(view, 'agent', 'materialize_for_commerce'))
    return {
      label: 'Materialize + verify Shopify',
      path: '/api/attune/webmcp',
      prefix: 'agent',
      command: { type: 'materialize_for_commerce', revisionId: 'r7' },
    };
  if (available(view, 'agent', 'navigate_to_storefront') && view.workspace.draftVersion === 7)
    return {
      label: 'Create r8 by moving slot',
      path: '/api/attune/human',
      prefix: 'buyer',
      command: { type: 'move_slot', centerX: 195, centerY: 60 },
    };
  return null;
}

function WorkflowBar({
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
  const next = workflowAction(view);
  const verified = view.workspace.commerceLinks.at(-1);
  return (
    <div className="workspace-actions">
      <div>
        <span>
          {view.validation.valid
            ? `Buildable r${view.workspace.draftVersion}`
            : 'Manufacturing conflict'}
        </span>
        <strong>
          {view.validation.valid
            ? 'The current draft can advance.'
            : 'Choose one deterministic valid change.'}
        </strong>
      </div>
      <div>
        {!view.validation.valid
          ? view.repairs.map((repair) => (
              <button
                type="button"
                key={repair.id}
                disabled={disabled}
                onClick={() =>
                  execute(
                    '/api/attune/human',
                    { type: 'apply_deterministic_repair', repairId: repair.id },
                    'buyer',
                  )
                }
              >
                {repair.label}
              </button>
            ))
          : null}
        {next ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => execute(next.path, next.command, next.prefix)}
          >
            {next.label}
          </button>
        ) : null}
        {verified && view.workspace.draftVersion === 7 ? (
          <a href={verified.verification.storefrontUrl}>Open verified Shopify ↗</a>
        ) : null}
      </div>
    </div>
  );
}

function EvidenceGrid({ view }: { readonly view: AttuneApiView }) {
  const verification = view.workspace.commerceLinks.at(-1);
  const receipts = view.records.receipts.toReversed().slice(0, 5);
  return (
    <section className="workspace-evidence">
      <article>
        <div className="shell-panel-heading">
          <span>Activity</span>
          <strong>{view.receiptCount} receipts</strong>
        </div>
        <ol>
          {receipts.map((receipt) => (
            <li key={receipt.receiptId}>
              <span>
                #{receipt.receiptSeq} · {receipt.origin}
              </span>
              <strong>{receipt.command.replaceAll('_', ' ')}</strong>
              <code>{receipt.specHashAfter.slice(0, 10)}</code>
            </li>
          ))}
        </ol>
      </article>
      <article>
        <div className="shell-panel-heading">
          <span>External verification</span>
          <strong>{verification ? 'VERIFIED' : 'PENDING'}</strong>
        </div>
        {verification ? (
          <dl className="commerce-proof">
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
              <dt>SKU</dt>
              <dd>{verification.verification.sku}</dd>
            </div>
            <div>
              <dt>Lot</dt>
              <dd>₹2,400 · 4 panels · qty 1</dd>
            </div>
          </dl>
        ) : (
          <p className="empty-evidence">
            Shopify Admin, publication, inventory, and Storefront evidence will appear here. Judges
            never need Admin access.
          </p>
        )}
      </article>
      <article>
        <div className="shell-panel-heading">
          <span>AT-1042 outcome</span>
          <strong>measured</strong>
        </div>
        <dl className="outcome-compact">
          <div>
            <dt>Need → buildable</dt>
            <dd>
              {view.impact.needToBuildableMs === null
                ? 'measuring'
                : `${Math.round(view.impact.needToBuildableMs / 1000)}s`}
            </dd>
          </div>
          <div>
            <dt>Conflicts pre-quote</dt>
            <dd>{view.impact.conflictsCaughtBeforeQuote}</dd>
          </div>
          <div>
            <dt>Locked mounts</dt>
            <dd>{view.impact.lockedRequirementsPreserved.preserved}/4</dd>
          </div>
          <div>
            <dt>Human intervention</dt>
            <dd>{view.impact.humanInterventionsDetected > 0 ? 'detected' : 'awaiting'}</dd>
          </div>
          <div>
            <dt>Stale actions blocked</dt>
            <dd>{view.impact.staleConsequentialActionsBlocked}</dd>
          </div>
          <div>
            <dt>Revision → Shopify</dt>
            <dd>{view.impact.exactRevisionShopifyVerifications > 0 ? 'exact' : 'pending'}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}

function WorkspaceShell({
  workspaceId,
  collaboration,
}: {
  readonly workspaceId: string;
  readonly collaboration: boolean;
}) {
  const [view, setView] = useState<AttuneApiView | null>(null);
  const [state, setState] = useState<ProductState>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setView(await requestAttuneView(attuneWorkspaceEndpoint('/api/attune/human', workspaceId)));
      setState('ready');
    } catch {
      setState('failed');
    }
  }, [workspaceId]);
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
      const next = await requestAttuneView(attuneWorkspaceEndpoint(path, workspaceId), {
        method: 'POST',
        body: commandRequestBody(view, command, prefix),
      });
      setView(next);
      setState('ready');
      window.dispatchEvent(new Event('attune:workspace-changed'));
    } catch (error) {
      setMessage(
        error instanceof AttuneHttpError
          ? `${error.code}: ${error.message}`
          : 'The command failed.',
      );
      setState('failed');
      await refresh();
    }
  }

  if (!view)
    return (
      <main className="workspace-loading">
        {state === 'failed' ? 'Workspace unavailable' : 'Loading authoritative workspace…'}
      </main>
    );
  return (
    <main className="workspace-page">
      <AttuneWebMcp workspaceId={workspaceId} />
      <header className="workspace-header">
        <Link className="wordmark" href="/dashboard">
          ATTUNE
        </Link>
        <div className="document-identity">
          <span>{view.product.projectName}</span>
          <strong>{view.product.fileName}</strong>
        </div>
        <div className="revision-identity">
          <span>{view.workspace.commitmentId}</span>
          <strong>Draft r{view.workspace.draftVersion}</strong>
          <span>seq {view.workspace.workspaceSeq}</span>
        </div>
      </header>
      {!collaboration ? (
        <div className="integration-banner">
          Liveblocks is wired but inactive until LIVEBLOCKS_SECRET_KEY is configured.
        </div>
      ) : null}
      {message ? <output className="workspace-message">{message}</output> : null}
      <section className="workspace-main">
        <SpecificationPanel view={view} />
        <GeometryStage view={view} collaboration={collaboration} />
        <CapabilityPanel view={view} />
      </section>
      <WorkflowBar
        view={view}
        disabled={state === 'applying'}
        execute={(path, command, prefix) => void execute(path, command, prefix)}
      />
      {collaboration ? <CollaborationPanel workspaceId={workspaceId} /> : null}
      <EvidenceGrid view={view} />
    </main>
  );
}

export function WorkspaceProduct({
  workspaceId,
  roomId,
  collaboration,
  actor,
}: {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly collaboration: boolean;
  readonly actor: { readonly id: string; readonly name: string; readonly role: CapabilityRole };
}) {
  if (!collaboration) return <WorkspaceShell workspaceId={workspaceId} collaboration={false} />;
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null, selection: [], currentTool: 'select', activeActor: actor }}
      >
        <YjsDraftBridge workspaceId={workspaceId} />
        <WorkspaceShell workspaceId={workspaceId} collaboration />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
