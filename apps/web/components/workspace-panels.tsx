'use client';

import type { ConstraintType, SketchCommand } from '@attune/domain';
import {
  addToSelection,
  createSelectionContext,
  rankConstraintCandidates,
  replaceSelection,
  toggleSelection,
  type GeometryEntity,
  type SelectionSet,
  type SketchDocument,
} from '@attune/domain/editor';
import { LayerCard } from '@cloudflare/kumo';
import { Button } from '@cloudflare/kumo/components/button';
import { Collapsible } from '@cloudflare/kumo/components/collapsible';
import { Input } from '@cloudflare/kumo/components/input';
import { Popover } from '@cloudflare/kumo/components/popover';
import {
  useHistoryVersions,
  useHistoryVersionYjsData,
  useSyncStatus,
  useThreads,
} from '@liveblocks/react';
import {
  AvatarStack,
  CommentPin,
  FloatingComposer,
  FloatingThread,
  Thread,
} from '@liveblocks/react-ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { SketchTemplate } from '../lib/projects/library';
import { humanizeSketchItemName, recursiveGroupEntityIds } from '../lib/sketch/items-tree';
import { sketchDocumentFromYjsVersion } from '../lib/sketch/versions';
import { AppIcons } from './ui/app-icons';
import { AppScrollArea } from './ui/app-scroll-area';
import { AttuneBrandmark } from './ui/attune-brandmark';
import type { CameraViewState, CanvasCommentPlacement } from './workspace-canvas';

function PanelShell({
  side,
  title,
  open,
  onClose,
  children,
}: {
  readonly side: 'left' | 'right';
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <LayerCard
      render={<aside />}
      className={`workspace-overlay-panel is-${side}`}
      data-open={open}
      aria-hidden={!open}
      aria-label={`${title} panel`}
    >
      <header>
        <strong>{title}</strong>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          shape="square"
          icon={<AppIcons.Close size={18} weight="bold" />}
          onClick={onClose}
          aria-label={`Close ${title}`}
        />
      </header>
      <div className="workspace-overlay-panel-content">{children}</div>
    </LayerCard>
  );
}

function ItemIcon({ kind }: { readonly kind: GeometryEntity['kind'] | 'group' | 'section' }) {
  const Icon =
    kind === 'group' || kind === 'section'
      ? AppIcons.Items
      : kind === 'line'
        ? AppIcons.Line
        : kind === 'circle'
          ? AppIcons.Circle
          : kind === 'arc'
            ? AppIcons.Arc
            : kind === 'ellipse'
              ? AppIcons.Ellipse
              : kind === 'bspline'
                ? AppIcons.BSpline
                : AppIcons.Concentric;
  return <Icon className="sketch-item-icon" size={18} weight="regular" aria-hidden />;
}

function entityDetail(entity: GeometryEntity): string {
  if (entity.kind === 'line')
    return `Line · ${Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y).toFixed(1)} mm`;
  if (entity.kind === 'circle') return `Circle · Ø${(entity.radius * 2).toFixed(1)} mm`;
  if (entity.kind === 'arc') return `Arc · R${entity.radius.toFixed(1)} mm`;
  if (entity.kind === 'ellipse')
    return `Ellipse · ${(entity.majorRadius * 2).toFixed(1)} × ${(entity.minorRadius * 2).toFixed(1)} mm`;
  if (entity.kind === 'bspline') return `Cubic B-spline · ${entity.controlPoints.length} controls`;
  return 'Point';
}

export function ItemsPanel({
  open,
  projectName,
  template,
  document,
  selection,
  onSelectionChange,
  onCommand,
  onClose,
}: {
  readonly open: boolean;
  readonly projectName: string;
  readonly template: SketchTemplate;
  readonly document: SketchDocument | null;
  readonly selection: SelectionSet;
  readonly onSelectionChange: (selection: SelectionSet) => void;
  readonly onCommand?: (command: SketchCommand) => Promise<SketchDocument>;
  readonly onClose: () => void;
}) {
  const treeRef = useRef<HTMLDivElement>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const groups = document?.groups ?? [];
  const childIds = new Set(groups.flatMap(({ childGroupIds }) => childGroupIds ?? []));
  const roots = groups.filter(({ id, parentGroupId }) => !parentGroupId && !childIds.has(id));
  const groupedEntityIds = new Set(groups.flatMap(({ entityIds }) => entityIds));
  const ungrouped = document?.entities.filter(({ id }) => !groupedEntityIds.has(id)) ?? [];
  const selectEntity = (event: React.MouseEvent, entityId: string) => {
    onSelectionChange(toggleSelection(selection, 'entity', entityId, event.shiftKey));
  };
  const selectGroup = (event: React.MouseEvent, groupId: string, entityIds: readonly string[]) => {
    let next = event.shiftKey
      ? toggleSelection(selection, 'group', groupId, true)
      : replaceSelection('group', [groupId]);
    next = addToSelection(next, 'entity', entityIds);
    onSelectionChange(next);
  };
  useEffect(() => {
    if (!open) return;
    const selectedId = selection.entityIds[0];
    if (!selectedId) return;
    treeRef.current
      ?.querySelector<HTMLElement>(`[data-entity-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, selection.entityIds]);
  const startRename = (groupId: string, name: string) => {
    setRenamingGroupId(groupId);
    setRenameValue(name);
  };
  const finishRename = (groupId: string) => {
    const name = renameValue.trim();
    const current = groups.find(({ id }) => id === groupId);
    setRenamingGroupId(null);
    if (!name || !onCommand || current?.name === name) return;
    void onCommand({ type: 'rename_group', groupId, name });
  };
  const renderEntity = (entity: GeometryEntity) => (
    <li
      key={entity.id}
      data-entity-id={entity.id}
      data-selected={selection.entityIds.includes(entity.id)}
    >
      <button type="button" onClick={(event) => selectEntity(event, entity.id)}>
        <ItemIcon kind={entity.kind} />
        <span>
          <strong>{entity.name ?? humanizeSketchItemName(entity.id)}</strong>
          <small>{entityDetail(entity)}</small>
        </span>
      </button>
    </li>
  );
  const renderGroup = (group: (typeof groups)[number], depth = 0): ReactNode => {
    const entities = group.entityIds.flatMap((id) => {
      const entity = document?.entities.find(({ id: candidate }) => candidate === id);
      return entity ? [entity] : [];
    });
    const children = (group.childGroupIds ?? []).flatMap((id) => {
      const child = groups.find(({ id: candidate }) => candidate === id);
      return child ? [child] : [];
    });
    const kind = group.kind ?? (depth === 0 && children.length > 0 ? 'section' : 'group');
    const recursiveEntityIds = document ? recursiveGroupEntityIds(document, group.id) : [];
    return (
      <Collapsible.Root className="sketch-item-branch" key={group.id} defaultOpen={depth < 1}>
        <div
          className="sketch-item-branch-row"
          data-selected={selection.groupIds.includes(group.id)}
        >
          <Collapsible.Trigger className="sketch-item-collapse" aria-label={`Toggle ${group.name}`}>
            <AppIcons.CollapseRight size={14} weight="bold" />
          </Collapsible.Trigger>
          <ItemIcon kind={kind} />
          {renamingGroupId === group.id ? (
            <Input
              size="sm"
              value={renameValue}
              aria-label={`Rename ${group.name}`}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') finishRename(group.id);
                if (event.key === 'Escape') setRenamingGroupId(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="sketch-item-name-button"
              aria-label={`Select ${humanizeSketchItemName(group.name)}`}
              onClick={(event) => selectGroup(event, group.id, recursiveEntityIds)}
              onDoubleClick={() => startRename(group.id, group.name)}
            >
              <span>
                <strong>{humanizeSketchItemName(group.name)}</strong>
                <small>
                  {recursiveEntityIds.length} entit{recursiveEntityIds.length === 1 ? 'y' : 'ies'}
                </small>
              </span>
            </button>
          )}
        </div>
        <Collapsible.Panel>
          <ul>
            {entities.map(renderEntity)}
            {children.map((child) => renderGroup(child, depth + 1))}
          </ul>
        </Collapsible.Panel>
      </Collapsible.Root>
    );
  };
  return (
    <PanelShell side="left" title="Items" open={open} onClose={onClose}>
      <div className="sketch-tree-heading">
        <AttuneBrandmark size={17} />
        <span>
          <strong>{projectName}</strong>
          <small>
            {!document || document.entities.length === 0
              ? 'Empty sketch'
              : `${template === 'spoke' ? 'Spoke wheel' : 'Sketch'} · ${document.entities.length} entities`}
          </small>
        </span>
      </div>
      {document && document.entities.length > 0 ? (
        <AppScrollArea className="min-h-0 flex-1" ariaLabel="Sketch items">
          <div className="sketch-item-tree" ref={treeRef}>
            {roots.map((group) => renderGroup(group))}
            {ungrouped.length > 0 ? (
              <section className="sketch-item-ungrouped" aria-label="Ungrouped geometry">
                <div className="sketch-item-branch-row">
                  <ItemIcon kind="section" />
                  <span>
                    <strong>Ungrouped</strong>
                    <small>{ungrouped.length} entities</small>
                  </span>
                </div>
                <ul>{ungrouped.map(renderEntity)}</ul>
              </section>
            ) : null}
          </div>
        </AppScrollArea>
      ) : (
        <p className="sketch-panel-note">Draw geometry to add items.</p>
      )}
    </PanelShell>
  );
}

export function SketchConstraintsPanel({
  open: panelOpen,
  document,
  selection,
  onCommand,
  onClose,
}: {
  readonly open: boolean;
  readonly document: SketchDocument | null;
  readonly selection: SelectionSet;
  readonly onCommand?: (command: SketchCommand) => Promise<SketchDocument>;
  readonly onClose: () => void;
}) {
  const context = document
    ? createSelectionContext(document, {
        entityIds: selection.entityIds,
        groupIds: selection.groupIds,
      })
    : null;
  const candidates =
    document && context
      ? rankConstraintCandidates(document, context).filter(({ refs }) =>
          refs.every(({ entityId }) => selection.entityIds.includes(entityId)),
        )
      : [];
  const selectedEntities =
    document?.entities.filter(({ id }) => selection.entityIds.includes(id)) ?? [];
  const actions = new Map(candidates.map((candidate) => [candidate.type, candidate]));
  if (selectedEntities.length > 0 && !actions.has('fixed')) {
    actions.set('fixed', {
      type: 'fixed',
      refs: [{ entityId: selectedEntities[0].id }],
      score: 1,
      reason: 'Lock the selected geometry.',
      predictedEffect: 'Removes remaining movement from the selected geometry.',
    });
  }
  const [constraintError, setConstraintError] = useState<{
    readonly type: string;
    readonly message: string;
  } | null>(null);
  const [dimensionDraft, setDimensionDraft] = useState<{
    readonly kind: 'distance' | 'radius' | 'diameter';
    readonly value: string;
  } | null>(null);
  const applyConstraint = async (type: ConstraintType) => {
    const candidate = actions.get(type);
    if (!candidate || !onCommand) return;
    setConstraintError(null);
    try {
      await onCommand({
        type: 'apply_constraint',
        constraints: [
          {
            id: `constraint:${candidate.type}:${crypto.randomUUID()}`,
            type: candidate.type,
            refs: candidate.refs,
          },
        ],
      });
    } catch (error) {
      setConstraintError({
        type,
        message: error instanceof Error ? error.message : 'That constraint could not be applied.',
      });
    }
  };
  const startDimension = (kind: 'distance' | 'radius' | 'diameter') => {
    const entity = selectedEntities[0];
    if (!entity) return;
    const defaultValue =
      entity.kind === 'line'
        ? Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y)
        : entity.kind === 'circle' || entity.kind === 'arc'
          ? kind === 'diameter'
            ? entity.radius * 2
            : entity.radius
          : 1;
    setDimensionDraft({ kind, value: defaultValue.toFixed(2) });
  };
  const addDimension = () => {
    const entity = selectedEntities[0];
    const kind = dimensionDraft?.kind;
    if (!entity || !kind || !onCommand) return;
    const value = Number(dimensionDraft.value);
    if (!Number.isFinite(value) || value <= 0) return;
    const refs =
      kind === 'distance' && entity.kind === 'line'
        ? [
            { entityId: entity.id, anchor: 'start' as const },
            { entityId: entity.id, anchor: 'end' as const },
          ]
        : [{ entityId: entity.id }];
    void onCommand({
      type: 'set_dimension',
      dimensions: [
        {
          id: `dimension:${kind}:${crypto.randomUUID()}`,
          kind,
          refs,
          value,
          driving: true,
        },
      ],
    }).then(() => setDimensionDraft(null));
  };
  return (
    <PanelShell side="right" title="Sketch Constraints" open={panelOpen} onClose={onClose}>
      {selectedEntities.length === 0 ? (
        <p className="sketch-panel-note">Select sketch geometry to see applicable relationships.</p>
      ) : (
        <>
          <p className="sketch-panel-note">
            {selectedEntities.length} selected · only valid actions are shown.
          </p>
          <div className="sketch-constraint-grid" aria-label="Applicable geometric constraints">
            {[...actions.values()].slice(0, 8).map((constraint) => {
              const error = constraintError?.type === constraint.type ? constraintError : null;
              const trigger = (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  title={constraint.predictedEffect}
                  onClick={() => void applyConstraint(constraint.type)}
                >
                  {constraint.type[0].toUpperCase() + constraint.type.slice(1)}
                </Button>
              );
              return (
                <Popover
                  key={`${constraint.type}:${constraint.refs.map(({ entityId }) => entityId).join(':')}`}
                  open={Boolean(error)}
                  onOpenChange={(nextOpen) => {
                    if (!nextOpen) setConstraintError(null);
                  }}
                >
                  <Popover.Trigger render={trigger} />
                  <Popover.Content side="left" sideOffset={8} className="sketch-constraint-error">
                    <Popover.Title>Constraint conflict</Popover.Title>
                    <p>{error?.message}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConstraintError(null)}
                    >
                      Cancel
                    </Button>
                  </Popover.Content>
                </Popover>
              );
            })}
          </div>
        </>
      )}
      <h3 className="sketch-panel-subtitle">Dimensions</h3>
      <div className="sketch-constraint-grid" aria-label="Dimensions">
        {selectedEntities.length === 1 && selectedEntities[0]?.kind === 'line' ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => startDimension('distance')}
          >
            Distance
          </Button>
        ) : null}
        {selectedEntities.length === 1 &&
        (selectedEntities[0]?.kind === 'circle' || selectedEntities[0]?.kind === 'arc') ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => startDimension('radius')}
            >
              Radius
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => startDimension('diameter')}
            >
              Diameter
            </Button>
          </>
        ) : null}
        {selectedEntities.length !== 1 ? <small>Select one dimensional entity.</small> : null}
      </div>
      <Popover
        open={dimensionDraft !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDimensionDraft(null);
        }}
      >
        <Popover.Trigger render={<span className="sketch-dimension-popover-anchor" />} />
        <Popover.Content side="left" sideOffset={8} className="sketch-dimension-editor">
          <Popover.Title>
            {dimensionDraft
              ? `${dimensionDraft.kind[0].toUpperCase()}${dimensionDraft.kind.slice(1)}`
              : 'Dimension'}
          </Popover.Title>
          <Input
            size="sm"
            inputMode="decimal"
            aria-label="Dimension value in millimetres"
            value={dimensionDraft?.value ?? ''}
            onChange={(event) =>
              dimensionDraft && setDimensionDraft({ ...dimensionDraft, value: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Escape') setDimensionDraft(null);
              if (event.key === 'Enter') addDimension();
            }}
          />
          <Button type="button" variant="primary" size="sm" onClick={addDimension}>
            Set dimension
          </Button>
        </Popover.Content>
      </Popover>
    </PanelShell>
  );
}

export interface SketchHistoryEvent {
  readonly id: string;
  readonly label: string;
  readonly actor: string;
  readonly createdAt: string;
}

export function HistoryPanel({
  open,
  events,
  onClose,
}: {
  readonly open: boolean;
  readonly events: readonly SketchHistoryEvent[];
  readonly onClose: () => void;
}) {
  return (
    <PanelShell side="right" title="History" open={open} onClose={onClose}>
      {events.length === 0 ? (
        <p className="sketch-panel-note">Sketch actions will appear here as they are recorded.</p>
      ) : (
        <AppScrollArea className="min-h-0 flex-1" ariaLabel="Sketch action history">
          <ol className="sketch-history-list">
            {events.map((event) => (
              <li key={event.id}>
                <span aria-hidden />
                <div>
                  <small>{event.actor}</small>
                  <strong>{event.label}</strong>
                  <time dateTime={event.createdAt}>
                    {new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(
                      new Date(event.createdAt),
                    )}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        </AppScrollArea>
      )}
    </PanelShell>
  );
}

export interface SketchVersionPreview {
  readonly id: string;
  readonly createdAt: Date;
  readonly document: SketchDocument;
}

function VersionData({
  id,
  createdAt,
  onPreview,
}: {
  readonly id: string;
  readonly createdAt: Date;
  readonly onPreview: (preview: SketchVersionPreview | null) => void;
}) {
  const result = useHistoryVersionYjsData(id);
  useEffect(() => {
    if (!result.data) return;
    const document = sketchDocumentFromYjsVersion(result.data);
    if (document) onPreview({ id, createdAt, document });
  }, [createdAt, id, onPreview, result.data]);
  if (result.isLoading) return <p className="sketch-panel-note">Loading version preview…</p>;
  if (result.error) return <p className="sketch-panel-note">This version could not be loaded.</p>;
  return null;
}

function VersionIdentityList({
  onPreview,
}: {
  readonly onPreview: (preview: SketchVersionPreview | null) => void;
}) {
  const result = useHistoryVersions();
  const versions = result.versions ?? [];
  const [selected, setSelected] = useState<(typeof versions)[number] | null>(null);
  return (
    <>
      <ul className="sketch-version-list">
        <li>
          <button type="button" aria-label="Preview current draft" onClick={() => onPreview(null)}>
            <span>
              <strong>Current draft</strong>
              <small>Live working copy</small>
            </span>
          </button>
        </li>
        {versions.slice(0, 5).map((version, index) => (
          <li key={version.id} data-selected={selected?.id === version.id}>
            <button
              type="button"
              aria-label={`Preview version ${versions.length - index}`}
              onClick={() => setSelected(version)}
            >
              <span>
                <strong>Version {versions.length - index}</strong>
                <small>
                  {new Intl.DateTimeFormat('en', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(version.createdAt)}
                </small>
              </span>
            </button>
          </li>
        ))}
        {!result.isLoading && versions.length === 0 ? (
          <li>
            <span>
              <small>No saved versions yet</small>
            </span>
          </li>
        ) : null}
      </ul>
      {selected ? (
        <VersionData id={selected.id} createdAt={selected.createdAt} onPreview={onPreview} />
      ) : null}
    </>
  );
}

export function DraftControl({
  collaboration,
  onPreview,
}: {
  readonly collaboration: boolean;
  readonly onPreview: (preview: SketchVersionPreview | null) => void;
}) {
  if (!collaboration) {
    return (
      <Button type="button" variant="ghost" size="base" disabled>
        Draft
      </Button>
    );
  }
  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button type="button" variant="ghost" size="base">
            Draft <AppIcons.CollapseDown size={14} weight="bold" />
          </Button>
        }
      />
      <Popover.Content
        side="bottom"
        align="center"
        sideOffset={8}
        positionMethod="fixed"
        className="workspace-draft-popover"
      >
        <Popover.Title>Draft versions</Popover.Title>
        <VersionIdentityList onPreview={onPreview} />
      </Popover.Content>
    </Popover>
  );
}

export function PresenceHeader() {
  const syncStatus = useSyncStatus();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const synchronized = mounted && syncStatus === 'synchronized';
  return (
    <div className="attune-liveblocks-bridge workspace-presence">
      <output
        className={synchronized ? 'workspace-sync-icon is-ready' : 'workspace-sync-icon'}
        aria-label={synchronized ? 'Workspace synchronized' : 'Workspace synchronizing'}
        title={synchronized ? 'Workspace synchronized' : 'Workspace synchronizing'}
      />
      <AvatarStack max={4} size={28} />
    </div>
  );
}

export function LiveCommentsRail({
  open,
  workspaceId,
  onClose,
}: {
  readonly open: boolean;
  readonly workspaceId: string;
  readonly onClose: () => void;
}) {
  const result = useThreads({ query: { metadata: { workspaceId } } });
  const threads = result.threads ?? [];
  return (
    <PanelShell side="left" title="Comments" open={open} onClose={onClose}>
      <AppScrollArea className="min-h-0 flex-1" ariaLabel="Canvas comment threads">
        <div className="workspace-comment-list attune-liveblocks-bridge">
          {threads.map((thread) => (
            <Thread key={thread.id} thread={thread} showComposer="collapsed" />
          ))}
          {threads.length === 0 && !result.isLoading ? (
            <p className="sketch-panel-note">No comments yet.</p>
          ) : null}
        </div>
      </AppScrollArea>
    </PanelShell>
  );
}

function worldToScreen(
  camera: CameraViewState,
  point: { readonly x: number; readonly y: number },
): { readonly left: number; readonly top: number } {
  return {
    left: camera.x + point.x * camera.zoom,
    top: camera.y - point.y * camera.zoom,
  };
}

function isWorldAnchor(metadata: Liveblocks['ThreadMetadata']): boolean {
  return Number.isFinite(metadata.worldX) && Number.isFinite(metadata.worldY);
}

function NewCommentComposer({
  workspaceId,
  placement,
  draftVersion,
  specHash,
}: {
  readonly workspaceId: string;
  readonly placement: CanvasCommentPlacement | null;
  readonly draftVersion: number;
  readonly specHash: string;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<CanvasCommentPlacement | null>(null);
  const activePlacement = open ? anchor : placement;
  const onOpenChange = (nextOpen: boolean) => {
    if (nextOpen && placement) setAnchor(placement);
    if (!nextOpen) setAnchor(null);
    setOpen(nextOpen);
  };
  if (!activePlacement) return null;
  return (
    <FloatingComposer
      open={open}
      onOpenChange={onOpenChange}
      metadata={{
        workspaceId,
        worldX: activePlacement.world.x,
        worldY: activePlacement.world.y,
        revisionId: `draft:r${draftVersion}`,
        specHash,
      }}
      side="right"
      sideOffset={8}
    >
      <CommentPin
        className="workspace-new-comment-pin"
        style={{ left: activePlacement.screen.x, top: activePlacement.screen.y }}
        aria-label="Add canvas comment"
      >
        <AppIcons.New size={15} weight="bold" />
      </CommentPin>
    </FloatingComposer>
  );
}

export function LiveCommentPins({
  workspaceId,
  camera,
  placement,
  draftVersion,
  specHash,
  onEntityFocus,
}: {
  readonly workspaceId: string;
  readonly camera: CameraViewState;
  readonly placement: CanvasCommentPlacement | null;
  readonly draftVersion: number;
  readonly specHash: string;
  readonly onEntityFocus?: (entityId: string | null) => void;
}) {
  const result = useThreads({ query: { metadata: { workspaceId } } });
  return (
    <div className="workspace-comment-pins attune-liveblocks-bridge" aria-label="Canvas comments">
      {(result.threads ?? []).map((thread) => {
        if (!isWorldAnchor(thread.metadata)) return null;
        const position = worldToScreen(camera, {
          x: thread.metadata.worldX,
          y: thread.metadata.worldY,
        });
        const entityId = thread.metadata.entityId || null;
        return (
          <FloatingThread
            key={thread.id}
            thread={thread}
            showComposer="collapsed"
            side="right"
            sideOffset={8}
          >
            <CommentPin
              userId={thread.comments.at(-1)?.userId}
              style={{ left: position.left, top: position.top }}
              aria-label="Open sketch comment"
              onFocus={() => entityId && onEntityFocus?.(entityId)}
              onBlur={() => onEntityFocus?.(null)}
              onPointerEnter={() => entityId && onEntityFocus?.(entityId)}
              onPointerLeave={() => onEntityFocus?.(null)}
            />
          </FloatingThread>
        );
      })}
      {camera.width > 0 && camera.height > 0 ? (
        <NewCommentComposer
          workspaceId={workspaceId}
          placement={placement}
          draftVersion={draftVersion}
          specHash={specHash}
        />
      ) : null}
    </div>
  );
}
