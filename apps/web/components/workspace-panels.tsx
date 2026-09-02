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
import { Button } from '@cloudflare/kumo/components/button';
import { Collapsible } from '@cloudflare/kumo/components/collapsible';
import { Input } from '@cloudflare/kumo/components/input';
import { Popover } from '@cloudflare/kumo/components/popover';
import { Sidebar } from '@cloudflare/kumo/components/sidebar';
import { Tooltip, TooltipProvider } from '@cloudflare/kumo/components/tooltip';
import { ContextMenu } from '@cloudflare/kumo/primitives/context-menu';
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
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import {
  humanizeSketchItemName,
  recursiveGroupEntityIds,
  sketchEntityDisplayName,
} from '../lib/sketch/items-tree';
import { sketchDocumentFromYjsVersion } from '../lib/sketch/versions';
import { AppIcons } from './ui/app-icons';
import type { CameraViewState, CanvasCommentPlacement } from './workspace-canvas';

function PanelShell({
  side,
  title,
  open,
  onClose,
  onWidthChange,
  children,
}: {
  readonly side: 'left' | 'right';
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onWidthChange?: (width: number) => void;
  readonly children: ReactNode;
}) {
  return (
    <Sidebar.Provider
      contained
      open={open}
      side={side}
      collapsible="offcanvas"
      resizable
      defaultWidth={288}
      minWidth={240}
      maxWidth={420}
      mobileBreakpoint={0}
      onWidthChange={onWidthChange}
      className="workspace-sidebar-provider"
    >
      <Sidebar
        className={`workspace-overlay-panel is-${side}`}
        data-open={open}
        aria-hidden={!open}
        aria-label={`${title} panel`}
      >
        <Sidebar.Header>
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
        </Sidebar.Header>
        <Sidebar.Content
          className="workspace-overlay-panel-content"
          aria-label={`${title} content`}
        >
          {children}
        </Sidebar.Content>
        <Sidebar.ResizeHandle />
      </Sidebar>
    </Sidebar.Provider>
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

function itemName(name: string) {
  return (
    <Tooltip content={name} side="right" render={<strong />}>
      {name}
    </Tooltip>
  );
}

function ItemContextMenu({
  trigger,
  actions,
  children,
}: {
  readonly trigger: ReactElement;
  readonly children?: ReactNode;
  readonly actions: readonly {
    readonly id: string;
    readonly label: string;
    readonly destructive?: boolean;
    readonly disabled?: boolean;
    readonly onSelect: () => void;
  }[];
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={trigger}>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="sketch-item-context-positioner" sideOffset={4}>
          <ContextMenu.Popup className="sketch-item-context-menu">
            {actions.map((action) => (
              <ContextMenu.Item
                key={action.id}
                className="sketch-item-context-item"
                data-destructive={action.destructive || undefined}
                disabled={action.disabled}
                onClick={action.onSelect}
              >
                {action.label}
              </ContextMenu.Item>
            ))}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function ItemsPanel({
  open,
  document,
  selection,
  onSelectionChange,
  onCommand,
  onClose,
  onWidthChange,
}: {
  readonly open: boolean;
  readonly document: SketchDocument | null;
  readonly selection: SelectionSet;
  readonly onSelectionChange: (selection: SelectionSet) => void;
  readonly onCommand?: (command: SketchCommand) => Promise<SketchDocument>;
  readonly onClose: () => void;
  readonly onWidthChange?: (width: number) => void;
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
  const createGroup = (kind: 'group' | 'section', parentGroupId?: string) => {
    if (!onCommand) return;
    const id = `${kind}:${crypto.randomUUID()}`;
    void onCommand({
      type: 'create_group',
      groups: [
        {
          id,
          name: kind === 'section' ? 'New section' : 'New group',
          kind,
          ...(parentGroupId ? { parentGroupId } : {}),
          entityIds: [],
        },
      ],
    }).then(() => startRename(id, kind === 'section' ? 'New section' : 'New group'));
  };
  const renderEntity = (entity: GeometryEntity) => {
    const name = document ? sketchEntityDisplayName(document, entity) : 'Sketch item';
    const movingIds = selection.entityIds.includes(entity.id) ? selection.entityIds : [entity.id];
    return (
      <ItemContextMenu
        key={entity.id}
        trigger={
          <li data-entity-id={entity.id} data-selected={selection.entityIds.includes(entity.id)}>
            <button type="button" onClick={(event) => selectEntity(event, entity.id)}>
              <ItemIcon kind={entity.kind} />
              <span>
                {itemName(name)}
                <small>{entityDetail(entity)}</small>
              </span>
            </button>
          </li>
        }
        actions={[
          ...groups.map((group) => ({
            id: `move:${group.id}`,
            label: `Move to ${humanizeSketchItemName(group.name)}`,
            onSelect: () =>
              void onCommand?.({ type: 'move_to_group', entityIds: movingIds, groupId: group.id }),
          })),
          {
            id: 'delete',
            label: 'Delete',
            destructive: true,
            onSelect: () => void onCommand?.({ type: 'delete_geometry', entityIds: movingIds }),
          },
        ]}
      />
    );
  };
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
        <ItemContextMenu
          trigger={
            <div
              className="sketch-item-branch-row"
              data-selected={selection.groupIds.includes(group.id)}
            />
          }
          actions={[
            { id: 'rename', label: 'Rename', onSelect: () => startRename(group.id, group.name) },
            {
              id: 'new-group',
              label: 'New group',
              onSelect: () => createGroup('group', group.id),
            },
            {
              id: 'new-section',
              label: 'New section',
              onSelect: () => createGroup('section', group.id),
            },
          ]}
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
              onKeyDown={(event) => {
                if (event.key === 'F2') {
                  event.preventDefault();
                  startRename(group.id, group.name);
                }
              }}
            >
              <span>
                {itemName(humanizeSketchItemName(group.name))}
                <small>
                  {recursiveEntityIds.length} entit{recursiveEntityIds.length === 1 ? 'y' : 'ies'}
                </small>
              </span>
            </button>
          )}
        </ItemContextMenu>
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
    <PanelShell
      side="left"
      title="Items"
      open={open}
      onClose={onClose}
      onWidthChange={onWidthChange}
    >
      <TooltipProvider>
        <div className="sketch-tree-actions" aria-label="Item organization">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<AppIcons.New size={15} />}
            onClick={() => createGroup('group')}
            disabled={!onCommand}
          >
            New group
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => createGroup('section')}
            disabled={!onCommand}
          >
            New section
          </Button>
        </div>
        {document && document.entities.length > 0 ? (
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
        ) : (
          <p className="sketch-panel-note">Draw geometry to add items.</p>
        )}
      </TooltipProvider>
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
        <Popover.Trigger
          nativeButton={false}
          render={<span className="sketch-dimension-popover-anchor" />}
        />
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
  onWidthChange,
}: {
  readonly open: boolean;
  readonly events: readonly SketchHistoryEvent[];
  readonly onClose: () => void;
  readonly onWidthChange?: (width: number) => void;
}) {
  return (
    <PanelShell
      side="right"
      title="History"
      open={open}
      onClose={onClose}
      onWidthChange={onWidthChange}
    >
      {events.length === 0 ? (
        <p className="sketch-panel-note">Sketch actions will appear here as they are recorded.</p>
      ) : (
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
  const [legacyVersion, setLegacyVersion] = useState(false);
  useEffect(() => {
    if (!result.data) return;
    const document = sketchDocumentFromYjsVersion(result.data);
    if (document) {
      setLegacyVersion(false);
      onPreview({ id, createdAt, document });
    } else {
      setLegacyVersion(true);
    }
  }, [createdAt, id, onPreview, result.data]);
  if (result.isLoading) return <p className="sketch-panel-note">Loading version preview…</p>;
  if (result.error) return <p className="sketch-panel-note">This version could not be loaded.</p>;
  if (legacyVersion)
    return <p className="sketch-panel-note">This legacy version has no sketch snapshot.</p>;
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
  onSaveVersion,
}: {
  readonly collaboration: boolean;
  readonly onPreview: (preview: SketchVersionPreview | null) => void;
  readonly onSaveVersion?: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
        <div className="workspace-version-actions">
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<AppIcons.Draft size={16} />}
            disabled={saving || !onSaveVersion}
            onClick={() => {
              if (!onSaveVersion) return;
              setSaving(true);
              setSaved(false);
              void onSaveVersion()
                .then(() => setSaved(true))
                .catch(() => undefined)
                .finally(() => setSaving(false));
            }}
          >
            {saving ? 'Saving…' : 'Save version'}
          </Button>
          <small>{saved ? 'Version saved.' : 'Capture the current synchronized draft.'}</small>
        </div>
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
  onWidthChange,
}: {
  readonly open: boolean;
  readonly workspaceId: string;
  readonly onClose: () => void;
  readonly onWidthChange?: (width: number) => void;
}) {
  const result = useThreads({ query: { metadata: { workspaceId } } });
  const threads = result.threads ?? [];
  return (
    <PanelShell
      side="left"
      title="Comments"
      open={open}
      onClose={onClose}
      onWidthChange={onWidthChange}
    >
      <div className="workspace-comment-list attune-liveblocks-bridge">
        {threads.map((thread) => (
          <Thread key={thread.id} thread={thread} showComposer="collapsed" />
        ))}
        {threads.length === 0 && !result.isLoading ? (
          <p className="sketch-panel-note">No comments yet.</p>
        ) : null}
      </div>
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
  onPlacementClear,
}: {
  readonly workspaceId: string;
  readonly placement: CanvasCommentPlacement | null;
  readonly draftVersion: number;
  readonly specHash: string;
  readonly onPlacementClear: () => void;
}) {
  if (!placement) return null;
  return (
    <FloatingComposer
      open
      onOpenChange={(open) => {
        if (!open) onPlacementClear();
      }}
      onComposerSubmit={onPlacementClear}
      metadata={{
        workspaceId,
        ...(placement.entityId ? { entityId: placement.entityId } : {}),
        ...(placement.nodeId ? { nodeId: placement.nodeId } : {}),
        worldX: placement.world.x,
        worldY: placement.world.y,
        revisionId: `draft:r${draftVersion}`,
        specHash,
      }}
      side="right"
      sideOffset={8}
    >
      <CommentPin
        className="workspace-new-comment-pin"
        style={{ left: placement.screen.x, top: placement.screen.y }}
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
  onPlacementClear,
  onEntityFocus,
}: {
  readonly workspaceId: string;
  readonly camera: CameraViewState;
  readonly placement: CanvasCommentPlacement | null;
  readonly draftVersion: number;
  readonly specHash: string;
  readonly onPlacementClear: () => void;
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
          onPlacementClear={onPlacementClear}
        />
      ) : null}
    </div>
  );
}
