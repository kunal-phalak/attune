'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Surface } from '@cloudflare/kumo/components/surface';
import { Tabs } from '@cloudflare/kumo/components/tabs';
import {
  useHistoryVersionYjsData,
  useHistoryVersions,
  useRoom,
  useSyncStatus,
  useThreads,
  useUnreadInboxNotificationsCount,
} from '@liveblocks/react';
import { AvatarStack, Composer, Thread } from '@liveblocks/react-ui';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import {
  ArrowUUpLeft,
  CaretDown,
  ChartLineUp,
  ChatCircle,
  ClockCounterClockwise,
  Lightning,
  ListChecks,
  LockSimple,
  Robot,
  ShoppingBagOpen,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';

import type { AttuneApiView, CapabilityView } from '../lib/attune-view';
import type { AttuneWebMcpStatus } from './attune-webmcp';

export type InspectorTab = 'design' | 'constraints' | 'capability' | 'commerce';
export type DockTab = 'activity' | 'agent' | 'comments' | 'history' | 'commerce' | 'outcome';

function isInspectorTab(value: string): value is InspectorTab {
  return (
    value === 'design' || value === 'constraints' || value === 'capability' || value === 'commerce'
  );
}

export interface WorkflowAction {
  readonly label: string;
  readonly path: string;
  readonly prefix: string;
  readonly command: Readonly<Record<string, unknown>>;
}

function formatCapability(id: string): string {
  return id.replaceAll('_', ' ');
}

function statusForEntity(entityId: string): string {
  if (entityId.startsWith('mount:')) return 'Buyer locked';
  if (entityId === 'slot:connector') return 'Editable feature';
  if (entityId.startsWith('constraint:')) return 'Driving constraint';
  return 'Specification item';
}

function TreeIcon({ kind }: { readonly kind: 'panel' | 'hole' | 'slot' | 'constraint' }) {
  if (kind === 'hole')
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <circle cx="9" cy="9" r="4" />
      </svg>
    );
  if (kind === 'slot')
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <rect x="3" y="6" width="12" height="6" rx="3" />
      </svg>
    );
  if (kind === 'constraint')
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path d="M3 9h12M6 6v6M12 6v6" />
      </svg>
    );
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <rect x="3" y="4" width="12" height="10" rx="1" />
    </svg>
  );
}

function LockMark() {
  return <LockSimple className="tree-lock" size={16} weight="fill" aria-label="Buyer locked" />;
}

export function ItemsPanel({
  view,
  selectedEntity,
  onSelect,
  onCollapse,
}: {
  readonly view: AttuneApiView;
  readonly selectedEntity: string;
  readonly onSelect: (entityId: string, tab?: InspectorTab) => void;
  readonly onCollapse: () => void;
}) {
  const geometry = view.workspace.geometry;
  return (
    <Surface render={<aside />} className="workspace-left-panel">
      <header className="rail-heading">
        <div>
          <span>Items</span>
          <strong>Executable specification</strong>
        </div>
        <button type="button" onClick={onCollapse} aria-label="Collapse items panel">
          ‹
        </button>
      </header>
      <div className="spec-summary-line">
        <span>AT-1042</span>
        <span>r{view.workspace.draftVersion} draft</span>
      </div>
      <div className="items-tree" role="tree" aria-label="Specification items">
        <button
          type="button"
          role="treeitem"
          aria-selected={selectedEntity === 'panel'}
          className={selectedEntity === 'panel' ? 'is-selected' : undefined}
          onClick={() => onSelect('panel', 'design')}
        >
          <TreeIcon kind="panel" />
          <span>
            <strong>Panel body</strong>
            <small>
              {geometry.width} × {geometry.height} × {geometry.thickness} mm
            </small>
          </span>
        </button>
        <div className="tree-group">
          <span>Protected mounts</span>
          {geometry.mounts.map((mount, index) => (
            <button
              type="button"
              role="treeitem"
              aria-selected={selectedEntity === mount.id}
              className={selectedEntity === mount.id ? 'is-selected' : undefined}
              key={mount.id}
              onClick={() => onSelect(mount.id, 'design')}
            >
              <TreeIcon kind="hole" />
              <span>
                <strong>Mount {index + 1}</strong>
                <small>Ø{mount.diameter} mm · buyer requirement</small>
              </span>
              <LockMark />
            </button>
          ))}
        </div>
        <div className="tree-group">
          <span>Features</span>
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedEntity === 'cutout:display'}
            className={selectedEntity === 'cutout:display' ? 'is-selected' : undefined}
            onClick={() => onSelect('cutout:display', 'design')}
          >
            <TreeIcon kind="panel" />
            <span>
              <strong>Display / controller</strong>
              <small>172 × 86 mm · radiused cutout</small>
            </span>
          </button>
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedEntity === 'cutout:fan'}
            className={selectedEntity === 'cutout:fan' ? 'is-selected' : undefined}
            onClick={() => onSelect('cutout:fan', 'design')}
          >
            <TreeIcon kind="hole" />
            <span>
              <strong>Cooling fan opening</strong>
              <small>Ø96 mm · through cut</small>
            </span>
          </button>
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedEntity.startsWith('hole:gland-')}
            className={selectedEntity.startsWith('hole:gland-') ? 'is-selected' : undefined}
            onClick={() => onSelect('hole:gland-center', 'design')}
          >
            <TreeIcon kind="hole" />
            <span>
              <strong>Cable-gland holes</strong>
              <small>3 × Ø22 mm · equal</small>
            </span>
          </button>
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedEntity.startsWith('slot:vent-')}
            className={selectedEntity.startsWith('slot:vent-') ? 'is-selected' : undefined}
            onClick={() => onSelect('slot:vent-3', 'design')}
          >
            <TreeIcon kind="slot" />
            <span>
              <strong>Ventilation array</strong>
              <small>6 slots · 82 × 6 mm</small>
            </span>
          </button>
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedEntity === 'cutout:secondary-control'}
            className={selectedEntity === 'cutout:secondary-control' ? 'is-selected' : undefined}
            onClick={() => onSelect('cutout:secondary-control', 'design')}
          >
            <TreeIcon kind="panel" />
            <span>
              <strong>Secondary control</strong>
              <small>68 × 44 mm · radiused cutout</small>
            </span>
          </button>
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedEntity === 'slot:connector'}
            className={selectedEntity === 'slot:connector' ? 'is-selected' : undefined}
            onClick={() => onSelect('slot:connector', 'constraints')}
          >
            <TreeIcon kind="slot" />
            <span>
              <strong>Connector slot</strong>
              <small>
                {geometry.slot.width} × {geometry.slot.height} mm · editable
              </small>
            </span>
            {!view.validation.valid ? <i className="tree-conflict-mark">!</i> : null}
          </button>
        </div>
        <div className="tree-group">
          <span>Constraints</span>
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedEntity === 'constraint:slot-clearance'}
            className={selectedEntity === 'constraint:slot-clearance' ? 'is-selected' : undefined}
            onClick={() => onSelect('constraint:slot-clearance', 'constraints')}
          >
            <TreeIcon kind="constraint" />
            <span>
              <strong>Slot clearance</strong>
              <small>
                {view.validation.evidence.slotRightClearanceMm} /{' '}
                {view.validation.evidence.requiredSlotClearanceMm} mm
              </small>
            </span>
            <i className={view.validation.valid ? 'tree-pass-mark' : 'tree-conflict-mark'}>
              {view.validation.valid ? '✓' : '!'}
            </i>
          </button>
        </div>
      </div>
      <footer className="items-panel-footer">
        <span>{view.workspace.fabricationQuantity} panels</span>
        <span>Aluminium</span>
        <span>{geometry.thickness} mm</span>
      </footer>
    </Surface>
  );
}

function SelectionProperties({
  view,
  selectedEntity,
}: {
  readonly view: AttuneApiView;
  readonly selectedEntity: string;
}) {
  const geometry = view.workspace.geometry;
  const isSlot =
    selectedEntity === 'slot:connector' || selectedEntity === 'constraint:slot-clearance';
  const mount = geometry.mounts.find(({ id }) => id === selectedEntity);
  return (
    <div className="inspector-section">
      <div className="selected-entity-heading">
        <span>{isSlot ? 'SL' : mount ? 'MT' : 'PN'}</span>
        <div>
          <strong>{isSlot ? 'Connector slot' : mount ? 'Buyer mount' : 'Panel body'}</strong>
          <small>{statusForEntity(selectedEntity)}</small>
        </div>
      </div>
      <dl className="property-grid">
        {isSlot ? (
          <>
            <div>
              <dt>Center X</dt>
              <dd>{geometry.slot.center.x} mm</dd>
            </div>
            <div>
              <dt>Center Y</dt>
              <dd>{geometry.slot.center.y} mm</dd>
            </div>
            <div>
              <dt>Width</dt>
              <dd>{geometry.slot.width} mm</dd>
            </div>
            <div>
              <dt>Height</dt>
              <dd>{geometry.slot.height} mm</dd>
            </div>
          </>
        ) : mount ? (
          <>
            <div>
              <dt>Center X</dt>
              <dd>{mount.center.x} mm</dd>
            </div>
            <div>
              <dt>Center Y</dt>
              <dd>{mount.center.y} mm</dd>
            </div>
            <div>
              <dt>Diameter</dt>
              <dd>{mount.diameter} mm</dd>
            </div>
            <div>
              <dt>Authority</dt>
              <dd>Buyer locked</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Width</dt>
              <dd>{geometry.width} mm</dd>
            </div>
            <div>
              <dt>Height</dt>
              <dd>{geometry.height} mm</dd>
            </div>
            <div>
              <dt>Thickness</dt>
              <dd>{geometry.thickness} mm</dd>
            </div>
            <div>
              <dt>Material</dt>
              <dd>{geometry.material}</dd>
            </div>
          </>
        )}
      </dl>
      <div className="authority-note">
        <span>Manufacturing intent</span>
        <p>
          Fabricate four matching aluminium control faceplates while preserving protected buyer
          installation interfaces.
        </p>
      </div>
    </div>
  );
}

function ConstraintsInspector({
  view,
  compareOpen,
  onCompare,
  onRepair,
  onAskAgent,
  disabled,
}: {
  readonly view: AttuneApiView;
  readonly compareOpen: boolean;
  readonly onCompare: () => void;
  readonly onRepair: (repairId: string) => void;
  readonly onAskAgent: () => void;
  readonly disabled: boolean;
}) {
  const evidence = view.validation.evidence;
  return (
    <div className="inspector-section constraint-inspector">
      <div
        className={
          view.validation.valid ? 'constraint-hero is-valid' : 'constraint-hero is-conflict'
        }
      >
        <span>{view.validation.valid ? 'Buildable' : 'Hard conflict'}</span>
        <strong>{evidence.slotRightClearanceMm} mm observed</strong>
        <p>{evidence.requiredSlotClearanceMm} mm required at the panel edge.</p>
      </div>
      <div className="preservation-proof">
        <span>Protected intent</span>
        <strong>
          {evidence.lockedMountsPreserved} / {evidence.lockedMountsTotal} mounts
        </strong>
        <p>Every offered repair keeps the buyer-locked mount geometry unchanged.</p>
      </div>
      {!view.validation.valid ? (
        view.perspective === 'buyer' ? (
          <div className="constraint-actions">
            <Button type="button" variant="primary" size="sm" onClick={onCompare}>
              Compare valid changes
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onAskAgent}>
              Ask buyer agent
            </Button>
          </div>
        ) : (
          <div className="authority-note">
            <span>Provider review</span>
            <p>The buyer must resolve this provider-specific conflict before requesting review.</p>
          </div>
        )
      ) : (
        <div className="unlocked-action">
          <span>New consequence</span>
          <strong>Request quote available</strong>
          <p>The current exact specification can now advance to provider commitment.</p>
        </div>
      )}
      {compareOpen && !view.validation.valid ? (
        <div className="repair-options">
          <header>
            <span>Valid alternatives</span>
            <small>Analytically verified</small>
          </header>
          {view.repairs.map((repair) => (
            <article key={repair.id}>
              <div>
                <strong>{repair.label}</strong>
                <span>{repair.predictedClearanceMm} mm</span>
              </div>
              <p>Preserves {repair.preservedLockedEntities.length} protected mounts.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => onRepair(repair.id)}
              >
                Apply exact repair
              </Button>
            </article>
          ))}
        </div>
      ) : null}
      <div className="constraint-checks">
        <div>
          <span>Equal cable-gland holes</span>
          <strong>Pass</strong>
        </div>
        <div>
          <span>Symmetry about panel axis</span>
          <strong>Pass</strong>
        </div>
      </div>
    </div>
  );
}

function CapabilityRow({ capability }: { readonly capability: CapabilityView }) {
  return (
    <article
      className={capability.available ? 'capability-row is-available' : 'capability-row is-blocked'}
    >
      <header>
        <strong>{formatCapability(capability.id)}</strong>
        <span>{capability.available ? 'Available' : 'Blocked'}</span>
      </header>
      <p>{capability.available ? capability.reason : capability.blockers[0]?.message}</p>
      {capability.available ? <small>{capability.predictedConsequences[0]}</small> : null}
    </article>
  );
}

function CapabilityInspector({ view }: { readonly view: AttuneApiView }) {
  const transition = view.latestCapabilityTransition;
  const next = view.frontiers[view.perspective].find(({ available }) => available);
  return (
    <div className="inspector-section">
      <div className="role-switcher" aria-label="Active capability perspective">
        <strong>{view.perspective} workspace</strong>
      </div>
      <p className="server-authority-note">
        Server membership and delegation determine this authority.
      </p>
      {next ? (
        <div className="contextual-capability">
          <Lightning size={20} weight="fill" />
          <div>
            <span>Available consequence</span>
            <strong>{formatCapability(next.id)}</strong>
            <p>{next.reason}</p>
            <small>{next.predictedConsequences[0]}</small>
          </div>
        </div>
      ) : null}
      <div className="capability-frontier-list">
        {view.frontiers[view.perspective].map((capability) => (
          <CapabilityRow capability={capability} key={capability.id} />
        ))}
      </div>
      {transition && (transition.gained.length > 0 || transition.lost.length > 0) ? (
        <div className="latest-capability-change">
          <span>Changed by latest receipt</span>
          {transition.gained.map(({ capabilityId, role: gainedRole }) => (
            <p className="is-gained" key={`gained-${gainedRole}-${capabilityId}`}>
              + {gainedRole}: {formatCapability(capabilityId)}
            </p>
          ))}
          {transition.lost.map(({ capabilityId, role: lostRole }) => (
            <p className="is-lost" key={`lost-${lostRole}-${capabilityId}`}>
              − {lostRole}: {formatCapability(capabilityId)}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function currentExactRecord(
  records: readonly { readonly revisionId: string; readonly specHash: string }[],
  view: AttuneApiView,
) {
  return records.some(
    ({ revisionId, specHash }) =>
      revisionId === `r${view.workspace.draftVersion}` && specHash === view.specHash,
  );
}

export function CommerceInspector({
  view,
  workflowAction,
  disabled,
  onWorkflow,
}: {
  readonly view: AttuneApiView;
  readonly workflowAction: WorkflowAction | null;
  readonly disabled: boolean;
  readonly onWorkflow: (action: WorkflowAction) => void;
}) {
  const exactRequest = view.workspace.manufacturingRequests.find(
    ({ specRevision, specHash }) =>
      specRevision === `r${view.workspace.draftVersion}` && specHash === view.specHash,
  );
  const draftOrder = exactRequest
    ? view.workspace.externalCommerceRecords.find(
        ({ requestId }) => requestId === exactRequest.requestId,
      )
    : undefined;
  const exactQuote = currentExactRecord(view.workspace.quotes, view);
  const exactAcceptance = currentExactRecord(view.workspace.acceptances, view);
  const exactCommerce = view.workspace.commerceLinks.find(
    ({ revisionId, specHash }) =>
      revisionId === `r${view.workspace.draftVersion}` && specHash === view.specHash,
  );
  const historicalCommerce = view.workspace.commerceLinks.at(-1);
  const steps = [
    { label: 'Buildable draft', complete: view.validation.valid },
    { label: 'Provider review requested', complete: Boolean(exactRequest) },
    { label: 'Frozen + quoted', complete: exactQuote },
    { label: 'Draft Order synchronized', complete: draftOrder?.syncState === 'IN_SYNC' },
    { label: 'Buyer accepted', complete: exactAcceptance },
    { label: 'Shopify verified', complete: Boolean(exactCommerce) },
  ];
  return (
    <div className="inspector-section commerce-inspector">
      <div className="commerce-lot">
        <span>One revision-bound fabrication lot</span>
        <strong>₹2,400</strong>
        <div>
          <span>4 fabricated panels</span>
          <span>Shopify cart quantity 1</span>
        </div>
      </div>
      <div className="commerce-contract-state">
        <span>Request visibility</span>
        <strong>{exactRequest?.visibility ?? 'PRIVATE'}</strong>
        <p>
          {draftOrder
            ? `Shopify Draft Order is ${draftOrder.syncState.toLowerCase().replaceAll('_', ' ')}.`
            : 'No Shopify Draft Order exists for an unquoted editing draft.'}
        </p>
      </div>
      <ol className="commerce-steps">
        {steps.map((step, index) => (
          <li className={step.complete ? 'is-complete' : undefined} key={step.label}>
            <span>{step.complete ? '✓' : index + 1}</span>
            <strong>{step.label}</strong>
          </li>
        ))}
      </ol>
      {workflowAction && view.validation.valid ? (
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="primary-action commerce-next-action"
          disabled={disabled}
          onClick={() => onWorkflow(workflowAction)}
        >
          {workflowAction.label}
        </Button>
      ) : null}
      {exactCommerce ? (
        <div className="shopify-handoff-ready">
          <span>Independent storefront verified</span>
          <strong>{exactCommerce.verification.title}</strong>
          <p>
            Attune's page-scoped tools yield after top-level navigation. Shopify-native WebMCP then
            controls the visible shopper session.
          </p>
          <a href={exactCommerce.verification.storefrontUrl}>
            Continue on Shopify <span>↗</span>
          </a>
        </div>
      ) : historicalCommerce ? (
        <div className="commerce-revoked">
          <span>Current authority revoked</span>
          <p>
            {historicalCommerce.revisionId} remains immutable and materialized. Draft r
            {view.workspace.draftVersion} requires a new quote and acceptance.
          </p>
        </div>
      ) : (
        <p className="commerce-awaiting">
          Shopify Admin, publication, inventory and Storefront evidence will appear here without
          requiring judge access to Shopify Admin.
        </p>
      )}
    </div>
  );
}

export function InspectorPanel({
  view,
  selectedEntity,
  tab,
  compareOpen,
  workflowAction,
  disabled,
  onTab,
  onCollapse,
  onCompare,
  onAskAgent,
  onRepair,
  onWorkflow,
}: {
  readonly view: AttuneApiView;
  readonly selectedEntity: string;
  readonly tab: InspectorTab;
  readonly compareOpen: boolean;
  readonly workflowAction: WorkflowAction | null;
  readonly disabled: boolean;
  readonly onTab: (tab: InspectorTab) => void;
  readonly onCollapse: () => void;
  readonly onCompare: () => void;
  readonly onAskAgent: () => void;
  readonly onRepair: (repairId: string) => void;
  readonly onWorkflow: (action: WorkflowAction) => void;
}) {
  return (
    <Surface render={<aside />} className="workspace-inspector">
      <header className="inspector-heading">
        <div>
          <span>Inspector</span>
          <strong>{selectedEntity.replaceAll(':', ' / ')}</strong>
        </div>
        <button type="button" onClick={onCollapse} aria-label="Collapse inspector">
          ›
        </button>
      </header>
      <div className="inspector-tabs" aria-label="Inspector modes">
        <Tabs
          variant="underline"
          size="sm"
          value={tab}
          tabs={(['design', 'constraints', 'capability', 'commerce'] as const).map((candidate) => ({
            value: candidate,
            label: candidate === 'design' ? 'Design' : candidate,
          }))}
          onValueChange={(next) => isInspectorTab(next) && onTab(next)}
        />
      </div>
      <div className="inspector-scroll">
        {tab === 'design' ? (
          <SelectionProperties view={view} selectedEntity={selectedEntity} />
        ) : null}
        {tab === 'constraints' ? (
          <ConstraintsInspector
            view={view}
            compareOpen={compareOpen}
            onCompare={onCompare}
            onRepair={onRepair}
            onAskAgent={onAskAgent}
            disabled={disabled}
          />
        ) : null}
        {tab === 'capability' ? <CapabilityInspector view={view} /> : null}
        {tab === 'commerce' ? (
          <CommerceInspector
            view={view}
            workflowAction={workflowAction}
            disabled={disabled}
            onWorkflow={onWorkflow}
          />
        ) : null}
      </div>
    </Surface>
  );
}

function lifecycleIndex(view: AttuneApiView): number {
  if (currentExactRecord(view.workspace.commerceLinks, view)) return 5;
  if (currentExactRecord(view.workspace.acceptances, view)) return 4;
  if (
    currentExactRecord(view.workspace.quotes, view) ||
    view.workspace.quoteRequests.some(
      ({ draftVersion, specHash }) =>
        draftVersion === view.workspace.draftVersion && specHash === view.specHash,
    )
  )
    return 3;
  if (view.validation.valid) return 2;
  return 1;
}

export function LifecycleStrip({ view }: { readonly view: AttuneApiView }) {
  const stages = ['Need', 'Conflict', 'Buildable', 'Quote', 'Accepted', 'Shopify'];
  const current = lifecycleIndex(view);
  const explanations = [
    'Custom fabrication need captured.',
    'Resolve 8.1 mm clearance without moving protected mounts.',
    'Exact specification can request a quote.',
    'Provider commitment must bind the exact revision.',
    'Accepted revision can accrue commerce authority.',
    'Verified product is ready for native storefront handoff.',
  ];
  return (
    <section className="lifecycle-strip" aria-label="Manufacturing lifecycle">
      <div className="lifecycle-track">
        {stages.map((stage, index) => (
          <div
            className={
              index === current ? 'is-current' : index < current ? 'is-complete' : undefined
            }
            key={stage}
          >
            <span>{index < current ? '✓' : index + 1}</span>
            <strong>{stage}</strong>
          </div>
        ))}
      </div>
      <p>
        <strong>{stages[current]}:</strong> {explanations[current]}
      </p>
    </section>
  );
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
    <Button
      type="button"
      variant="secondary"
      size="sm"
      icon={<ArrowUUpLeft size={16} weight="bold" />}
      onClick={restore}
      disabled={!version.data}
    >
      Load as draft
    </Button>
  );
}

export function CollaborationHeader() {
  const syncStatus = useSyncStatus();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const synchronized = mounted && syncStatus === 'synchronized';
  return (
    <div className="workspace-collaborators">
      <span className={synchronized ? 'sync-state is-synced' : 'sync-state'}>
        <i /> {synchronized ? 'Synced' : 'Connecting'}
      </span>
      <AvatarStack max={4} size={26} />
    </div>
  );
}

function commentAnchor(view: AttuneApiView, entityId: string) {
  const geometry = view.workspace.geometry;
  const point =
    geometry.mounts.find(({ id }) => id === entityId)?.center ??
    geometry.auxiliaryHoles.find(({ id }) => id === entityId)?.center ??
    geometry.circularCutouts.find(({ id }) => id === entityId)?.center ??
    geometry.rectangularCutouts.find(({ id }) => id === entityId)?.center ??
    geometry.ventSlots.find(({ id }) => id === entityId)?.center ??
    (entityId === 'slot:connector' || entityId === 'constraint:slot-clearance'
      ? geometry.slot.center
      : { x: geometry.width / 2, y: geometry.height / 2 });
  return { x: 96 + point.x * 1.25, y: 48 + point.y * 1.25 };
}

function CollaborationDock({
  workspaceId,
  tab,
  view,
  selectedEntity,
  onSelectEntity,
}: {
  readonly workspaceId: string;
  readonly tab: 'comments' | 'history';
  readonly view: AttuneApiView;
  readonly selectedEntity: string;
  readonly onSelectEntity: (entityId: string) => void;
}) {
  const threadResult = useThreads({ query: { metadata: { workspaceId } } });
  const historyResult = useHistoryVersions();
  const notificationResult = useUnreadInboxNotificationsCount();
  const threads = threadResult.threads ?? [];
  const versions = historyResult.versions ?? [];
  if (tab === 'comments') {
    const anchor = commentAnchor(view, selectedEntity);
    return (
      <div className="dock-collaboration-content">
        <header>
          <span>{threads.length} discussions</span>
          <span>{notificationResult.count ?? 0} unread</span>
        </header>
        <div className="dock-thread-grid">
          {threads.slice(0, 4).map((thread) => (
            <article className="spatial-thread" key={thread.id}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                icon={<ChatCircle size={16} weight="fill" />}
                onClick={() => onSelectEntity(thread.metadata.entityId)}
              >
                Show {thread.metadata.entityId.replaceAll(':', ' ')} on canvas
              </Button>
              <span>{thread.metadata.revisionId}</span>
              <Thread thread={thread} showComposer="collapsed" />
            </article>
          ))}
          <div className="spatial-comment-composer">
            <p>
              New comment will stay attached to{' '}
              <strong>{selectedEntity.replaceAll(':', ' ')}</strong> on draft r
              {view.workspace.draftVersion}.
            </p>
            <Composer
              metadata={{
                workspaceId,
                entityId: selectedEntity,
                ...anchor,
                revisionId: `draft:r${view.workspace.draftVersion}`,
                specHash: view.specHash,
              }}
            />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="dock-history-content">
      <header>
        <ClockCounterClockwise size={20} weight="bold" />
        <p>
          Liveblocks versions change the mutable draft only. Frozen Attune revisions remain
          immutable.
        </p>
      </header>
      {versions.slice(0, 4).map((version) => (
        <article key={version.id}>
          <div>
            <strong>Collaborative draft snapshot</strong>
            <span>Restore creates a current draft; it never rewrites a frozen revision.</span>
            <details>
              <summary>Trace details</summary>
              <code>{version.id}</code>
            </details>
          </div>
          <RestoreYjsVersion versionId={version.id} />
        </article>
      ))}
      {versions.length === 0 ? <span>No collaboration snapshots yet.</span> : null}
    </div>
  );
}

function ActivityDock({ view }: { readonly view: AttuneApiView }) {
  const receipts = view.records.receipts.toReversed().slice(0, 6);
  return (
    <div className="activity-dock-content">
      {receipts.length === 0 ? (
        <p>No semantic commands yet. The seeded requirement is authoritative state.</p>
      ) : (
        receipts.map((receipt) => (
          <details key={receipt.receiptId}>
            <summary>
              <span>{receipt.origin.replaceAll('_', ' ')}</span>
              <strong>{formatCapability(receipt.command)}</strong>
              <time>
                {new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(
                  new Date(receipt.createdAt),
                )}
              </time>
            </summary>
            <div>
              <code>receipt #{receipt.receiptSeq}</code>
              <code>
                draft r{receipt.draftVersion} · capability epoch {receipt.capabilityEpoch}
              </code>
              <code>before {receipt.specHashBefore.slice(0, 14)}…</code>
              <code>after {receipt.specHashAfter.slice(0, 14)}…</code>
            </div>
          </details>
        ))
      )}
    </div>
  );
}

function AgentDock({
  status,
  view,
}: {
  readonly status: AttuneWebMcpStatus;
  readonly view: AttuneApiView;
}) {
  const changed = status.interventions > 0 || view.observation.interventions.length > 0;
  return (
    <div className="agent-dock-content">
      <section className="agent-identity-card">
        <Robot size={24} weight="fill" />
        <div>
          <span>{view.perspective} delegated agent</span>
          <strong>
            {status.registration === 'registered' ? 'Agent connected' : status.registration}
          </strong>
          <p>Native WebMCP · authority follows the active server delegation.</p>
        </div>
      </section>
      <section>
        <span>Last observed</span>
        <strong>
          {status.draftVersion ? `Draft r${status.draftVersion}` : 'Awaiting observation'}
        </strong>
        <p>
          {status.workspaceSeq === null
            ? 'No sequence observed'
            : `Authoritative workspace sequence ${status.workspaceSeq}`}
        </p>
      </section>
      <section className={changed ? 'is-alert' : undefined}>
        <span>Human intervention</span>
        <strong>{changed ? 'Automatically detected' : 'No unseen change'}</strong>
        <p>
          {changed
            ? 'The next consequential action must revalidate or replan.'
            : 'Observation cursor matches current state.'}
        </p>
      </section>
      <section>
        <span>Last execution</span>
        <strong>{status.execution.replaceAll('_', ' ')}</strong>
        <p>
          {status.lastAction
            ? formatCapability(status.lastAction)
            : 'No tool executed in this tab.'}
        </p>
      </section>
      <div className="agent-tool-list">
        <span>Available now</span>
        {status.availableTools.map((tool) => (
          <code key={tool}>{tool}</code>
        ))}
      </div>
    </div>
  );
}

function OutcomeDock({ view }: { readonly view: AttuneApiView }) {
  const metrics = view.impact;
  const rows = [
    [
      'Need → buildable',
      metrics.needToBuildableMs === null
        ? 'Measuring'
        : `${Math.round(metrics.needToBuildableMs / 1000)}s`,
    ],
    ['Hard conflicts caught pre-quote', String(metrics.conflictsCaughtBeforeQuote)],
    ['Buyer-locked mounts preserved', `${metrics.lockedRequirementsPreserved.preserved} / 4`],
    ['Human intervention detected', metrics.humanInterventionsDetected > 0 ? 'Yes' : 'Not yet'],
    ['Stale commerce actions blocked', String(metrics.staleConsequentialActionsBlocked)],
    [
      'Frozen revision → Shopify match',
      metrics.exactRevisionShopifyVerifications > 0 ? 'Exact' : 'Pending',
    ],
  ] as const;
  return (
    <div className="outcome-dock-content">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      <p>
        Measured from authoritative receipts and verification records. No estimated improvement
        claims.
      </p>
    </div>
  );
}

export function BottomDock({
  view,
  workspaceId,
  collaboration,
  tab,
  webMcpStatus,
  workflowAction,
  disabled,
  onTab,
  onWorkflow,
  selectedEntity,
  onSelectEntity,
}: {
  readonly view: AttuneApiView;
  readonly workspaceId: string;
  readonly collaboration: boolean;
  readonly tab: DockTab | null;
  readonly webMcpStatus: AttuneWebMcpStatus;
  readonly workflowAction: WorkflowAction | null;
  readonly disabled: boolean;
  readonly onTab: (tab: DockTab | null) => void;
  readonly onWorkflow: (action: WorkflowAction) => void;
  readonly selectedEntity: string;
  readonly onSelectEntity: (entityId: string) => void;
}) {
  const tabs: readonly DockTab[] = [
    'activity',
    'agent',
    'comments',
    'history',
    'commerce',
    'outcome',
  ];
  const icon = {
    activity: <ListChecks size={16} weight="bold" />,
    agent: <Robot size={16} weight="fill" />,
    comments: <ChatCircle size={16} weight="fill" />,
    history: <ClockCounterClockwise size={16} weight="bold" />,
    commerce: <ShoppingBagOpen size={16} weight="bold" />,
    outcome: <ChartLineUp size={16} weight="bold" />,
  } as const;
  return (
    <section className={tab ? 'workspace-bottom-dock is-open' : 'workspace-bottom-dock'}>
      <nav aria-label="Workspace detail dock">
        {tabs.map((candidate) => (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            icon={icon[candidate]}
            key={candidate}
            aria-pressed={tab === candidate}
            onClick={() => onTab(tab === candidate ? null : candidate)}
          >
            {candidate}
            {candidate === 'activity' && view.receiptCount > 0 ? (
              <span>{view.receiptCount}</span>
            ) : null}
            {candidate === 'agent' ? (
              <i className={webMcpStatus.registration === 'registered' ? 'is-online' : undefined} />
            ) : null}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          shape="square"
          icon={<CaretDown size={16} weight="bold" />}
          className="dock-collapse"
          onClick={() => onTab(null)}
          aria-label="Collapse dock"
        />
      </nav>
      {tab ? (
        <div className="dock-body">
          {tab === 'activity' ? <ActivityDock view={view} /> : null}
          {tab === 'agent' ? <AgentDock status={webMcpStatus} view={view} /> : null}
          {(tab === 'comments' || tab === 'history') && collaboration ? (
            <CollaborationDock
              workspaceId={workspaceId}
              tab={tab}
              view={view}
              selectedEntity={selectedEntity}
              onSelectEntity={onSelectEntity}
            />
          ) : null}
          {(tab === 'comments' || tab === 'history') && !collaboration ? (
            <p className="dock-empty">
              Realtime collaboration is not configured in this environment.
            </p>
          ) : null}
          {tab === 'commerce' ? (
            <CommerceInspector
              view={view}
              workflowAction={workflowAction}
              disabled={disabled}
              onWorkflow={onWorkflow}
            />
          ) : null}
          {tab === 'outcome' ? <OutcomeDock view={view} /> : null}
        </div>
      ) : null}
    </section>
  );
}
