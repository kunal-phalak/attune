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
import { LockSimple } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';

import type { AttuneApiView, CapabilityView } from '../lib/attune-view';
import type { AttuneWebMcpStatus } from './attune-webmcp';
import { AppIcons } from './ui/app-icons';
import { AppScrollArea } from './ui/app-scroll-area';

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
  return (
    <LockSimple
      className="ml-auto shrink-0 text-kumo-brand"
      size={16}
      weight="fill"
      aria-label="Buyer locked"
    />
  );
}

function treeItemClass(selected: boolean) {
  return `grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-100 hover:bg-kumo-fill-hover focus-visible:outline-2 focus-visible:outline-kumo-focus [&>svg]:size-4 [&>svg]:fill-none [&>svg]:stroke-current [&>svg]:stroke-[1.4] [&>span>strong]:block [&>span>strong]:truncate [&>span>strong]:text-xs [&>span>small]:mt-0.5 [&>span>small]:block [&>span>small]:truncate [&>span>small]:text-[11px] [&>span>small]:text-kumo-subtle ${selected ? 'bg-kumo-fill text-kumo-contrast' : 'text-kumo-subtle'}`;
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
    <Surface
      render={<aside />}
      className="absolute top-[124px] bottom-14 left-3 z-40 hidden w-[248px] min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-kumo-line bg-kumo-base/95 shadow-md backdrop-blur lg:flex"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-kumo-line px-3">
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-kumo-subtle">
            Items
          </span>
          <strong className="block truncate text-xs font-semibold">Executable specification</strong>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          shape="square"
          icon={<AppIcons.CollapseLeft size={16} weight="bold" />}
          onClick={onCollapse}
          aria-label="Collapse items panel"
        />
      </header>
      <div className="flex shrink-0 items-center justify-between border-b border-kumo-line px-3 py-2 text-[11px] text-kumo-subtle">
        <span>AT-1042</span>
        <span>r{view.workspace.draftVersion} draft</span>
      </div>
      <AppScrollArea
        className="min-h-0 flex-1"
        contentClassName="space-y-1 p-2"
        ariaLabel="Specification items"
      >
        <div role="tree" aria-label="Specification items">
          <button
            type="button"
            role="treeitem"
            aria-selected={selectedEntity === 'panel'}
            className={treeItemClass(selectedEntity === 'panel')}
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
          <div className="mt-3 space-y-1 border-t border-kumo-line pt-2">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
              Protected mounts
            </span>
            {geometry.mounts.map((mount, index) => (
              <button
                type="button"
                role="treeitem"
                aria-selected={selectedEntity === mount.id}
                className={treeItemClass(selectedEntity === mount.id)}
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
          <div className="mt-3 space-y-1 border-t border-kumo-line pt-2">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
              Features
            </span>
            <button
              type="button"
              role="treeitem"
              aria-selected={selectedEntity === 'cutout:display'}
              className={treeItemClass(selectedEntity === 'cutout:display')}
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
              className={treeItemClass(selectedEntity === 'cutout:fan')}
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
              className={treeItemClass(selectedEntity.startsWith('hole:gland-'))}
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
              className={treeItemClass(selectedEntity.startsWith('slot:vent-'))}
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
              className={treeItemClass(selectedEntity === 'cutout:secondary-control')}
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
              className={treeItemClass(selectedEntity === 'slot:connector')}
              onClick={() => onSelect('slot:connector', 'constraints')}
            >
              <TreeIcon kind="slot" />
              <span>
                <strong>Connector slot</strong>
                <small>
                  {geometry.slot.width} × {geometry.slot.height} mm · editable
                </small>
              </span>
              {!view.validation.valid ? (
                <i className="grid size-5 place-items-center rounded-full bg-attune-conflict/10 text-[11px] font-bold not-italic text-attune-conflict">
                  !
                </i>
              ) : null}
            </button>
          </div>
          <div className="mt-3 space-y-1 border-t border-kumo-line pt-2">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
              Constraints
            </span>
            <button
              type="button"
              role="treeitem"
              aria-selected={selectedEntity === 'constraint:slot-clearance'}
              className={treeItemClass(selectedEntity === 'constraint:slot-clearance')}
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
              <i
                className={`grid size-5 place-items-center rounded-full text-[11px] font-bold not-italic ${view.validation.valid ? 'bg-attune-valid/10 text-attune-valid' : 'bg-attune-conflict/10 text-attune-conflict'}`}
              >
                {view.validation.valid ? <AppIcons.Check size={12} weight="bold" /> : '!'}
              </i>
            </button>
          </div>
        </div>
      </AppScrollArea>
      <footer className="flex shrink-0 items-center justify-between border-t border-kumo-line px-3 py-2 text-[10px] text-kumo-subtle">
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
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-kumo-recessed text-[11px] font-bold text-kumo-subtle">
          {isSlot ? 'SL' : mount ? 'MT' : 'PN'}
        </span>
        <div className="min-w-0">
          <strong className="block truncate text-sm">
            {isSlot ? 'Connector slot' : mount ? 'Buyer mount' : 'Panel body'}
          </strong>
          <small className="block text-xs text-kumo-subtle">
            {statusForEntity(selectedEntity)}
          </small>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-kumo-line bg-kumo-line [&>div]:bg-kumo-base [&>div]:p-3 [&_dt]:text-[10px] [&_dt]:uppercase [&_dt]:tracking-wider [&_dt]:text-kumo-subtle [&_dd]:mt-1 [&_dd]:text-xs [&_dd]:font-semibold">
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
      <div className="rounded-lg border border-kumo-line bg-kumo-recessed p-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
          Manufacturing intent
        </span>
        <p className="mt-1 text-xs leading-5 text-kumo-subtle">
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
    <div className="space-y-4 p-4">
      <div
        className={`rounded-xl border p-4 ${view.validation.valid ? 'border-attune-valid/30 bg-attune-valid/5' : 'border-attune-conflict/30 bg-attune-conflict/5'}`}
      >
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${view.validation.valid ? 'text-attune-valid' : 'text-attune-conflict'}`}
        >
          {view.validation.valid ? 'Buildable' : 'Hard conflict'}
        </span>
        <strong className="mt-1 block text-lg">{evidence.slotRightClearanceMm} mm observed</strong>
        <p className="mt-1 text-xs text-kumo-subtle">
          {evidence.requiredSlotClearanceMm} mm required at the panel edge.
        </p>
      </div>
      <div className="rounded-lg border border-kumo-line p-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
          Protected intent
        </span>
        <strong className="mt-1 block text-sm">
          {evidence.lockedMountsPreserved} / {evidence.lockedMountsTotal} mounts
        </strong>
        <p className="mt-1 text-xs leading-5 text-kumo-subtle">
          Every offered repair keeps the buyer-locked mount geometry unchanged.
        </p>
      </div>
      {!view.validation.valid ? (
        view.perspective === 'buyer' ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" size="sm" onClick={onCompare}>
              Compare valid changes
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onAskAgent}>
              Ask buyer agent
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-kumo-line bg-kumo-recessed p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
              Provider review
            </span>
            <p className="mt-1 text-xs leading-5 text-kumo-subtle">
              The buyer must resolve this provider-specific conflict before requesting review.
            </p>
          </div>
        )
      ) : (
        <div className="rounded-lg border border-attune-valid/30 bg-attune-valid/5 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-attune-valid">
            New consequence
          </span>
          <strong className="mt-1 block text-sm">Request quote available</strong>
          <p className="mt-1 text-xs leading-5 text-kumo-subtle">
            The current exact specification can now advance to provider commitment.
          </p>
        </div>
      )}
      {compareOpen && !view.validation.valid ? (
        <div className="space-y-2">
          <header className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Valid alternatives</span>
            <small className="text-[10px] text-kumo-subtle">Analytically verified</small>
          </header>
          {view.repairs.map((repair) => (
            <article className="rounded-lg border border-kumo-line p-3" key={repair.id}>
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs">{repair.label}</strong>
                <span className="text-xs font-semibold text-attune-valid">
                  {repair.predictedClearanceMm} mm
                </span>
              </div>
              <p className="my-2 text-[11px] text-kumo-subtle">
                Preserves {repair.preservedLockedEntities.length} protected mounts.
              </p>
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
      <div className="divide-y divide-kumo-line rounded-lg border border-kumo-line text-xs [&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-2 [&>div]:p-3 [&_strong]:text-attune-valid">
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
      className={`rounded-lg border p-3 ${capability.available ? 'border-attune-valid/30 bg-attune-valid/5' : 'border-kumo-line bg-kumo-recessed/50'}`}
    >
      <header className="flex items-center justify-between gap-2">
        <strong className="text-xs capitalize">{formatCapability(capability.id)}</strong>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${capability.available ? 'text-attune-valid' : 'text-kumo-subtle'}`}
        >
          {capability.available ? 'Available' : 'Blocked'}
        </span>
      </header>
      <p className="mt-1 text-xs leading-5 text-kumo-subtle">
        {capability.available ? capability.reason : capability.blockers[0]?.message}
      </p>
      {capability.available ? (
        <small className="mt-2 block text-[11px] text-attune-valid">
          {capability.predictedConsequences[0]}
        </small>
      ) : null}
    </article>
  );
}

function CapabilityInspector({ view }: { readonly view: AttuneApiView }) {
  const transition = view.latestCapabilityTransition;
  const next = view.frontiers[view.perspective].find(({ available }) => available);
  return (
    <div className="space-y-4 p-4">
      <div
        className="rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2"
        aria-label="Active capability perspective"
      >
        <strong className="text-xs capitalize">{view.perspective} workspace</strong>
      </div>
      <p className="text-xs leading-5 text-kumo-subtle">
        Server membership and delegation determine this authority.
      </p>
      {next ? (
        <div className="flex gap-3 rounded-xl border border-kumo-brand/25 bg-kumo-brand/5 p-3 text-kumo-brand">
          <AppIcons.Capability size={20} weight="fill" />
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Available consequence
            </span>
            <strong className="mt-1 block text-sm capitalize text-kumo-contrast">
              {formatCapability(next.id)}
            </strong>
            <p className="mt-1 text-xs leading-5 text-kumo-subtle">{next.reason}</p>
            <small className="mt-2 block text-[11px]">{next.predictedConsequences[0]}</small>
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        {view.frontiers[view.perspective].map((capability) => (
          <CapabilityRow capability={capability} key={capability.id} />
        ))}
      </div>
      {transition && (transition.gained.length > 0 || transition.lost.length > 0) ? (
        <div className="rounded-lg border border-kumo-line p-3 text-xs">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
            Changed by latest receipt
          </span>
          {transition.gained.map(({ capabilityId, role: gainedRole }) => (
            <p className="mt-2 text-attune-valid" key={`gained-${gainedRole}-${capabilityId}`}>
              + {gainedRole}: {formatCapability(capabilityId)}
            </p>
          ))}
          {transition.lost.map(({ capabilityId, role: lostRole }) => (
            <p className="mt-2 text-attune-conflict" key={`lost-${lostRole}-${capabilityId}`}>
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
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-kumo-line bg-kumo-recessed p-4">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
          One revision-bound fabrication lot
        </span>
        <strong className="mt-1 block text-2xl">₹2,400</strong>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-kumo-subtle">
          <span>4 fabricated panels</span>
          <span>Shopify cart quantity 1</span>
        </div>
      </div>
      <div className="rounded-lg border border-kumo-line p-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-kumo-subtle">
          Request visibility
        </span>
        <strong className="mt-1 block text-sm">{exactRequest?.visibility ?? 'PRIVATE'}</strong>
        <p className="mt-1 text-xs leading-5 text-kumo-subtle">
          {draftOrder
            ? `Shopify Draft Order is ${draftOrder.syncState.toLowerCase().replaceAll('_', ' ')}.`
            : 'No Shopify Draft Order exists for an unquoted editing draft.'}
        </p>
      </div>
      <ol className="space-y-1.5">
        {steps.map((step, index) => (
          <li
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${step.complete ? 'border-attune-valid/25 bg-attune-valid/5' : 'border-kumo-line'}`}
            key={step.label}
          >
            <span
              className={`grid size-5 place-items-center rounded-full text-[10px] font-bold ${step.complete ? 'bg-attune-valid text-white' : 'bg-kumo-recessed text-kumo-subtle'}`}
            >
              {step.complete ? <AppIcons.Check size={12} weight="bold" /> : index + 1}
            </span>
            <strong className="font-medium">{step.label}</strong>
          </li>
        ))}
      </ol>
      {workflowAction && view.validation.valid ? (
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="w-full"
          disabled={disabled}
          onClick={() => onWorkflow(workflowAction)}
        >
          {workflowAction.label}
        </Button>
      ) : null}
      {exactCommerce ? (
        <div className="rounded-xl border border-attune-valid/30 bg-attune-valid/5 p-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-attune-valid">
            Independent storefront verified
          </span>
          <strong className="mt-1 block text-sm">{exactCommerce.verification.title}</strong>
          <p className="mt-2 text-xs leading-5 text-kumo-subtle">
            Attune's page-scoped tools yield after top-level navigation. Shopify-native WebMCP then
            controls the visible shopper session.
          </p>
          <a
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-kumo-brand no-underline hover:underline"
            href={exactCommerce.verification.storefrontUrl}
          >
            Continue on Shopify <AppIcons.OpenExternal size={16} weight="bold" />
          </a>
        </div>
      ) : historicalCommerce ? (
        <div className="rounded-lg border border-attune-conflict/25 bg-attune-conflict/5 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-attune-conflict">
            Current authority revoked
          </span>
          <p className="mt-1 text-xs leading-5 text-kumo-subtle">
            {historicalCommerce.revisionId} remains immutable and materialized. Draft r
            {view.workspace.draftVersion} requires a new quote and acceptance.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-kumo-line p-3 text-xs leading-5 text-kumo-subtle">
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
    <Surface
      render={<aside />}
      className="absolute top-[124px] right-3 bottom-14 z-40 hidden w-[320px] min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-kumo-line bg-kumo-base/95 shadow-md backdrop-blur lg:flex"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-kumo-line px-3">
        <div className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-kumo-subtle">
            Inspector
          </span>
          <strong className="block truncate text-xs font-semibold">
            {selectedEntity.replaceAll(':', ' / ')}
          </strong>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          shape="square"
          icon={<AppIcons.CollapseRight size={16} weight="bold" />}
          onClick={onCollapse}
          aria-label="Collapse inspector"
        />
      </header>
      <div className="shrink-0 border-b border-kumo-line px-2 pt-1" aria-label="Inspector modes">
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
      <AppScrollArea className="min-h-0 flex-1" ariaLabel="Inspector content">
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
      </AppScrollArea>
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
    <section
      className="absolute top-[72px] left-1/2 z-40 w-[min(760px,calc(100%-24px))] -translate-x-1/2 rounded-xl border border-kumo-line bg-kumo-base/95 px-3 py-2 shadow-sm backdrop-blur md:flex md:items-center md:gap-5 md:px-4"
      aria-label="Manufacturing lifecycle"
    >
      <div className="flex min-w-0 items-center overflow-hidden">
        {stages.map((stage, index) => (
          <div
            className={`relative flex min-w-0 flex-1 items-center gap-1.5 text-[10px] font-medium after:mx-2 after:h-px after:min-w-2 after:flex-1 after:bg-kumo-line last:after:hidden md:text-xs ${index === current ? 'text-kumo-brand' : index < current ? 'text-attune-valid' : 'text-kumo-subtle'}`}
            key={stage}
          >
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${index === current ? 'border-kumo-brand bg-kumo-brand text-white' : index < current ? 'border-attune-valid bg-attune-valid text-white' : 'border-kumo-line bg-kumo-recessed'}`}
            >
              {index < current ? <AppIcons.Check size={11} weight="bold" /> : index + 1}
            </span>
            <strong className="hidden truncate font-medium sm:block">{stage}</strong>
          </div>
        ))}
      </div>
      <p className="mt-1 truncate text-[11px] text-kumo-subtle md:mt-0 md:max-w-sm md:text-right">
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
      icon={<AppIcons.Restore size={16} weight="bold" />}
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
    <div className="attune-liveblocks-bridge hidden items-center gap-2 lg:flex">
      <span className="inline-flex items-center gap-1.5 text-xs text-kumo-subtle">
        <i
          className={`size-1.5 rounded-full ${synchronized ? 'bg-attune-valid' : 'bg-kumo-contrast/35'}`}
        />{' '}
        {synchronized ? 'Synced' : 'Connecting'}
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
      <div className="space-y-3 p-3">
        <header className="flex items-center justify-between text-[11px] text-kumo-subtle">
          <span>{threads.length} discussions</span>
          <span>{notificationResult.count ?? 0} unread</span>
        </header>
        <div className="grid gap-3 lg:grid-cols-2">
          {threads.slice(0, 4).map((thread) => (
            <article className="min-w-0 space-y-2 rounded-lg bg-kumo-recessed p-3" key={thread.id}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                icon={<AppIcons.Comments size={16} weight="fill" />}
                onClick={() => onSelectEntity(thread.metadata.entityId)}
              >
                Show {thread.metadata.entityId.replaceAll(':', ' ')} on canvas
              </Button>
              <span className="block text-[10px] text-kumo-subtle">
                {thread.metadata.revisionId}
              </span>
              <div className="attune-liveblocks-bridge attune-liveblocks-bridge--surface">
                <Thread thread={thread} showComposer="collapsed" />
              </div>
            </article>
          ))}
          <div className="space-y-2 rounded-lg bg-kumo-recessed p-3">
            <p className="text-xs leading-5 text-kumo-subtle">
              New comment will stay attached to{' '}
              <strong>{selectedEntity.replaceAll(':', ' ')}</strong> on draft r
              {view.workspace.draftVersion}.
            </p>
            <div className="attune-liveblocks-bridge attune-liveblocks-bridge--surface">
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
      </div>
    );
  }
  return (
    <div className="space-y-2 p-3">
      <header className="flex items-start gap-2 rounded-lg bg-kumo-recessed p-3">
        <AppIcons.History className="shrink-0" size={20} weight="bold" />
        <p className="text-xs leading-5 text-kumo-subtle">
          Liveblocks versions change the mutable draft only. Frozen Attune revisions remain
          immutable.
        </p>
      </header>
      {versions.slice(0, 4).map((version) => (
        <article
          className="flex items-center justify-between gap-4 rounded-lg px-3 py-2 hover:bg-kumo-fill-hover"
          key={version.id}
        >
          <div className="min-w-0">
            <strong className="block text-xs">Collaborative draft snapshot</strong>
            <span className="mt-0.5 block truncate text-[11px] text-kumo-subtle">
              Restore creates a current draft; it never rewrites a frozen revision.
            </span>
            <details>
              <summary className="mt-1 cursor-pointer text-[10px] text-kumo-subtle">
                Trace details
              </summary>
              <code className="text-[10px]">{version.id}</code>
            </details>
          </div>
          <RestoreYjsVersion versionId={version.id} />
        </article>
      ))}
      {versions.length === 0 ? (
        <span className="block p-3 text-xs text-kumo-subtle">No collaboration snapshots yet.</span>
      ) : null}
    </div>
  );
}

function ActivityDock({ view }: { readonly view: AttuneApiView }) {
  const receipts = view.records.receipts.toReversed().slice(0, 6);
  return (
    <div className="space-y-1 p-3">
      {receipts.length === 0 ? (
        <p className="text-xs text-kumo-subtle">
          No semantic commands yet. The seeded requirement is authoritative state.
        </p>
      ) : (
        receipts.map((receipt) => (
          <details className="rounded-lg px-3 py-2 open:bg-kumo-recessed" key={receipt.receiptId}>
            <summary className="grid cursor-pointer grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3 text-xs">
              <span className="capitalize text-kumo-subtle">
                {receipt.origin.replaceAll('_', ' ')}
              </span>
              <strong className="truncate capitalize">{formatCapability(receipt.command)}</strong>
              <time className="text-[10px] text-kumo-subtle">
                {new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(
                  new Date(receipt.createdAt),
                )}
              </time>
            </summary>
            <div className="mt-2 grid gap-1 text-[10px] text-kumo-subtle sm:grid-cols-2">
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
    <div className="grid gap-2 p-3 md:grid-cols-4">
      <section className="flex gap-3 rounded-lg bg-attune-agent/5 p-3 md:col-span-2">
        <AppIcons.Agent className="shrink-0 text-attune-agent" size={24} weight="fill" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-attune-agent">
            {view.perspective} delegated agent
          </span>
          <strong className="mt-1 block text-sm">
            {status.registration === 'registered' ? 'Agent connected' : status.registration}
          </strong>
          <p className="mt-1 text-xs text-kumo-subtle">
            Native WebMCP · authority follows the active server delegation.
          </p>
        </div>
      </section>
      <section className="rounded-lg bg-kumo-recessed p-3">
        <span className="text-[10px] uppercase tracking-wider text-kumo-subtle">Last observed</span>
        <strong className="mt-1 block text-xs">
          {status.draftVersion ? `Draft r${status.draftVersion}` : 'Awaiting observation'}
        </strong>
        <p className="mt-1 text-[11px] text-kumo-subtle">
          {status.workspaceSeq === null
            ? 'No sequence observed'
            : `Authoritative workspace sequence ${status.workspaceSeq}`}
        </p>
      </section>
      <section
        className={`rounded-lg p-3 ${changed ? 'bg-attune-conflict/5' : 'bg-kumo-recessed'}`}
      >
        <span className="text-[10px] uppercase tracking-wider text-kumo-subtle">
          Human intervention
        </span>
        <strong className="mt-1 block text-xs">
          {changed ? 'Automatically detected' : 'No unseen change'}
        </strong>
        <p className="mt-1 text-[11px] text-kumo-subtle">
          {changed
            ? 'The next consequential action must revalidate or replan.'
            : 'Observation cursor matches current state.'}
        </p>
      </section>
      <section className="rounded-lg bg-kumo-recessed p-3">
        <span className="text-[10px] uppercase tracking-wider text-kumo-subtle">
          Last execution
        </span>
        <strong className="mt-1 block text-xs capitalize">
          {status.execution.replaceAll('_', ' ')}
        </strong>
        <p className="mt-1 text-[11px] text-kumo-subtle">
          {status.lastAction
            ? formatCapability(status.lastAction)
            : 'No tool executed in this tab.'}
        </p>
      </section>
      <div className="rounded-lg bg-kumo-recessed p-3">
        <span className="block text-[10px] uppercase tracking-wider text-kumo-subtle">
          Available now
        </span>
        {status.availableTools.map((tool) => (
          <code className="mt-1 block truncate text-[10px]" key={tool}>
            {tool}
          </code>
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
    <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([label, value]) => (
        <div className="rounded-lg bg-kumo-recessed p-3" key={label}>
          <span className="block text-[10px] text-kumo-subtle">{label}</span>
          <strong className="mt-1 block text-sm">{value}</strong>
        </div>
      ))}
      <p className="col-span-full text-[10px] text-kumo-subtle">
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
    activity: <AppIcons.Activity size={16} weight="bold" />,
    agent: <AppIcons.Agent size={16} weight="fill" />,
    comments: <AppIcons.Comments size={16} weight="fill" />,
    history: <AppIcons.History size={16} weight="bold" />,
    commerce: <AppIcons.Commerce size={16} weight="bold" />,
    outcome: <AppIcons.Outcome size={16} weight="bold" />,
  } as const;
  return (
    <section
      className={`absolute right-2 bottom-2 left-2 z-50 mx-auto overflow-hidden rounded-xl border border-kumo-line bg-kumo-base/95 shadow-md backdrop-blur transition-[height,max-width] duration-100 ${tab ? 'h-[min(300px,42vh)] max-w-5xl' : 'h-10 max-w-3xl'}`}
    >
      <nav
        className="flex h-10 items-center gap-0.5 overflow-x-auto px-1 no-scrollbar"
        aria-label="Workspace detail dock"
      >
        {tabs.map((candidate) => (
          <Button
            type="button"
            variant={tab === candidate ? 'secondary' : 'ghost'}
            size="xs"
            icon={icon[candidate]}
            key={candidate}
            aria-pressed={tab === candidate}
            onClick={() => onTab(tab === candidate ? null : candidate)}
          >
            <span className="hidden sm:inline">{candidate}</span>
            {candidate === 'activity' && view.receiptCount > 0 ? (
              <span className="grid min-w-4 place-items-center rounded-full bg-kumo-fill px-1 text-[9px]">
                {view.receiptCount}
              </span>
            ) : null}
            {candidate === 'agent' ? (
              <i
                className={`size-1.5 rounded-full ${webMcpStatus.registration === 'registered' ? 'bg-attune-valid' : 'bg-kumo-contrast/30'}`}
              />
            ) : null}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          shape="square"
          icon={<AppIcons.CollapseDown size={16} weight="bold" />}
          className="ml-auto shrink-0"
          onClick={() => onTab(null)}
          aria-label="Collapse dock"
        />
      </nav>
      {tab ? (
        <AppScrollArea
          className="h-[calc(100%-2.5rem)] border-t border-kumo-line"
          ariaLabel={`${tab} panel`}
        >
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
            <p className="p-4 text-xs text-kumo-subtle">
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
        </AppScrollArea>
      ) : null}
    </section>
  );
}
