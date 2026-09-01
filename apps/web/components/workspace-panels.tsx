'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import { Surface } from '@cloudflare/kumo/components/surface';
import { useHistoryVersions, useSyncStatus, useThreads } from '@liveblocks/react';
import {
  AvatarStack,
  CommentPin,
  FloatingComposer,
  FloatingThread,
  Thread,
} from '@liveblocks/react-ui';
import { useEffect, useState, type ReactNode } from 'react';

import type { SketchTemplate } from '../lib/projects/library';
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
    <Surface
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
    </Surface>
  );
}

function ItemIcon({ kind }: { readonly kind: 'circle' | 'line' | 'group' }) {
  return (
    <span className={`sketch-item-icon is-${kind}`} aria-hidden>
      {kind === 'group' ? '6' : null}
    </span>
  );
}

export function ItemsPanel({
  open,
  projectName,
  template,
  onClose,
}: {
  readonly open: boolean;
  readonly projectName: string;
  readonly template: SketchTemplate;
  readonly onClose: () => void;
}) {
  const items =
    template === 'spoke'
      ? [
          { name: 'Outer ring', detail: 'Circle · Ø300 mm', kind: 'circle' as const },
          { name: 'Inner ring', detail: 'Circle · Ø264 mm', kind: 'circle' as const },
          { name: 'Center hub', detail: 'Circle · Ø76 mm', kind: 'circle' as const },
          { name: 'Center bore', detail: 'Circle · Ø32 mm', kind: 'circle' as const },
          { name: 'Spokes', detail: '6 lines · radial', kind: 'group' as const },
        ]
      : [];
  return (
    <PanelShell side="left" title="Items" open={open} onClose={onClose}>
      <div className="sketch-tree-heading">
        <AttuneBrandmark size={17} />
        <span>
          <strong>{projectName}</strong>
          <small>{items.length === 0 ? 'Empty sketch' : '10 sketch entities'}</small>
        </span>
      </div>
      {items.length > 0 ? (
        <ul className="sketch-item-list">
          {items.map((item) => (
            <li key={item.name}>
              <ItemIcon kind={item.kind} />
              <span>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sketch-panel-note">Draw geometry to add items.</p>
      )}
    </PanelShell>
  );
}

export function SketchConstraintsPanel({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const constraints = ['Coincident', 'Horizontal / Vertical', 'Equal', 'Tangent', 'Fix'];
  const dimensions = ['Distance', 'Radius', 'Diameter', 'Angle'];
  return (
    <PanelShell side="right" title="Sketch Constraints" open={open} onClose={onClose}>
      <p className="sketch-panel-note">Select sketch geometry to apply a relationship.</p>
      <div className="sketch-constraint-grid" aria-label="Geometric constraints">
        {constraints.map((constraint) => (
          <Button key={constraint} type="button" variant="secondary" size="sm" disabled>
            {constraint}
          </Button>
        ))}
      </div>
      <h3 className="sketch-panel-subtitle">Dimensions</h3>
      <div className="sketch-constraint-grid" aria-label="Dimensions">
        {dimensions.map((dimension) => (
          <Button key={dimension} type="button" variant="secondary" size="sm" disabled>
            {dimension}
          </Button>
        ))}
      </div>
    </PanelShell>
  );
}

export interface SketchHistoryEvent {
  readonly id: string;
  readonly label: string;
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
        <ol className="sketch-history-list">
          {events.map((event) => (
            <li key={event.id}>
              <span aria-hidden />
              <div>
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

function VersionIdentityList() {
  const result = useHistoryVersions();
  const versions = result.versions ?? [];
  return (
    <ul className="sketch-version-list is-compact">
      <li>
        <span>
          <strong>Current draft</strong>
          <small>Live working copy</small>
        </span>
      </li>
      {versions.slice(0, 5).map((version, index) => (
        <li key={version.id}>
          <span>
            <strong>Version {versions.length - index}</strong>
            <small>
              {new Intl.DateTimeFormat('en', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(version.createdAt)}
            </small>
          </span>
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
  );
}

export function DraftControl({ collaboration }: { readonly collaboration: boolean }) {
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
        <VersionIdentityList />
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
