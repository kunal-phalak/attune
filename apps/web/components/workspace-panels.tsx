'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Surface } from '@cloudflare/kumo/components/surface';
import {
  useHistoryVersionYjsData,
  useHistoryVersions,
  useRoom,
  useSyncStatus,
  useThreads,
} from '@liveblocks/react';
import { AvatarStack, CommentPin, Composer, Thread } from '@liveblocks/react-ui';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import { useEffect, useState, type ReactNode } from 'react';
import * as Y from 'yjs';

import { AppIcons } from './ui/app-icons';
import { AppScrollArea } from './ui/app-scroll-area';

function PanelShell({
  side,
  title,
  onClose,
  children,
}: {
  readonly side: 'left' | 'right';
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Surface
      render={<aside />}
      className={`workspace-overlay-panel is-${side}`}
      aria-label={`${title} panel`}
    >
      <header>
        <strong>{title}</strong>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          shape="square"
          icon={<AppIcons.Close size={16} weight="bold" />}
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

export function ItemsPanel({ onClose }: { readonly onClose: () => void }) {
  const items = [
    { name: 'Outer ring', detail: 'Circle · Ø300 mm', kind: 'circle' as const },
    { name: 'Inner ring', detail: 'Circle · Ø264 mm', kind: 'circle' as const },
    { name: 'Center hub', detail: 'Circle · Ø76 mm', kind: 'circle' as const },
    { name: 'Center bore', detail: 'Circle · Ø32 mm', kind: 'circle' as const },
    { name: 'Spokes', detail: '6 lines · radial', kind: 'group' as const },
  ];
  return (
    <PanelShell side="left" title="Items" onClose={onClose}>
      <div className="sketch-tree-heading">
        <AppIcons.Brand size={17} weight="bold" />
        <span>
          <strong>Spoke sketch</strong>
          <small>10 sketch entities</small>
        </span>
      </div>
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
    </PanelShell>
  );
}

export function ViewPanel({
  onClose,
  onFit,
  onReset,
}: {
  readonly onClose: () => void;
  readonly onFit: () => void;
  readonly onReset: () => void;
}) {
  return (
    <PanelShell side="right" title="View" onClose={onClose}>
      <div className="workspace-panel-actions">
        <Button type="button" variant="secondary" onClick={onFit}>
          Zoom to fit
        </Button>
        <Button type="button" variant="ghost" onClick={onReset}>
          Reset view
        </Button>
      </div>
      <dl className="sketch-view-list">
        <div>
          <dt>Grid</dt>
          <dd>Adaptive 1 / 2 / 5</dd>
        </div>
        <div>
          <dt>Axes</dt>
          <dd>X / Y visible</dd>
        </div>
        <div>
          <dt>Navigation</dt>
          <dd>Drag to pan · wheel to zoom</dd>
        </div>
      </dl>
    </PanelShell>
  );
}

export function SketchConstraintsPanel({ onClose }: { readonly onClose: () => void }) {
  const constraints = ['Coincident', 'Horizontal / Vertical', 'Equal', 'Tangent', 'Fix'];
  const dimensions = ['Distance', 'Radius', 'Diameter', 'Angle'];
  return (
    <PanelShell side="right" title="Sketch Constraints" onClose={onClose}>
      <p className="sketch-panel-note">Select sketch geometry to apply a relationship.</p>
      <div className="sketch-constraint-grid" aria-label="Geometric constraints">
        {constraints.map((constraint) => (
          <button type="button" key={constraint} disabled>
            <span aria-hidden>—</span>
            {constraint}
          </button>
        ))}
      </div>
      <h3 className="sketch-panel-subtitle">Dimensions</h3>
      <div className="sketch-constraint-grid" aria-label="Dimensions">
        {dimensions.map((dimension) => (
          <button type="button" key={dimension} disabled>
            <span aria-hidden>↔</span>
            {dimension}
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

function RestoreVersionButton({ versionId }: { readonly versionId: string }) {
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
    <Button type="button" variant="ghost" size="xs" disabled={!version.data} onClick={restore}>
      Load
    </Button>
  );
}

function VersionList({ compact = false }: { readonly compact?: boolean }) {
  const result = useHistoryVersions();
  const versions = result.versions ?? [];
  if (result.isLoading) return <p className="sketch-panel-note">Loading versions…</p>;
  if (versions.length === 0) return <p className="sketch-panel-note">No saved versions yet.</p>;
  return (
    <ul className={compact ? 'sketch-version-list is-compact' : 'sketch-version-list'}>
      {versions.slice(0, compact ? 5 : 12).map((version) => (
        <li key={version.id}>
          <span>
            <strong>
              {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(version.createdAt)}
            </strong>
            <small>
              {new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(version.createdAt)} ·{' '}
              {version.authors.length || 1} editor
            </small>
          </span>
          {compact ? null : <RestoreVersionButton versionId={version.id} />}
        </li>
      ))}
    </ul>
  );
}

export function LiveHistoryPanel({ onClose }: { readonly onClose: () => void }) {
  return (
    <PanelShell side="right" title="History" onClose={onClose}>
      <VersionList />
    </PanelShell>
  );
}

export function LocalHistoryPanel({ onClose }: { readonly onClose: () => void }) {
  return (
    <PanelShell side="right" title="History" onClose={onClose}>
      <p className="sketch-panel-note">Version history is available in collaborative workspaces.</p>
    </PanelShell>
  );
}

export function DraftControl({ collaboration }: { readonly collaboration: boolean }) {
  if (!collaboration) {
    return (
      <button className="workspace-draft-control" type="button" disabled>
        Draft
      </button>
    );
  }
  return <LiveDraftControl />;
}

function LiveDraftControl() {
  const [open, setOpen] = useState(false);
  return (
    <div className="workspace-draft-menu">
      <button
        className="workspace-draft-control"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        Draft <AppIcons.CollapseDown size={14} weight="bold" />
      </button>
      {open ? (
        <dialog className="workspace-draft-popover" open aria-label="Draft history">
          <strong>Version history</strong>
          <VersionList compact />
        </dialog>
      ) : null}
    </div>
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
  workspaceId,
  draftVersion,
  specHash,
  onClose,
}: {
  readonly workspaceId: string;
  readonly draftVersion: number;
  readonly specHash: string;
  readonly onClose: () => void;
}) {
  const result = useThreads({ query: { metadata: { workspaceId } } });
  const threads = result.threads ?? [];
  return (
    <PanelShell side="left" title="Comments" onClose={onClose}>
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
      <div className="workspace-comment-composer attune-liveblocks-bridge">
        <Composer
          metadata={{
            workspaceId,
            entityId: 'sketch:spoke',
            x: 390,
            y: 210,
            revisionId: `draft:r${draftVersion}`,
            specHash,
          }}
        />
      </div>
    </PanelShell>
  );
}

function pinPosition(x: number, y: number): { readonly left: string; readonly top: string } {
  const left = Math.min(Math.max((x / 720) * 100, 12), 88);
  const top = Math.min(Math.max((y / 440) * 100, 16), 84);
  return { left: `${left}%`, top: `${top}%` };
}

export function LiveCommentPins({ workspaceId }: { readonly workspaceId: string }) {
  const result = useThreads({ query: { metadata: { workspaceId } } });
  return (
    <div className="workspace-comment-pins attune-liveblocks-bridge" aria-label="Canvas comments">
      {(result.threads ?? []).map((thread, index) => {
        const position = pinPosition(
          thread.metadata.x || 360 + index * 20,
          thread.metadata.y || 220,
        );
        return (
          <CommentPin
            key={thread.id}
            userId={thread.comments.at(-1)?.userId}
            style={position}
            aria-label="Comment on spoke sketch"
          />
        );
      })}
    </div>
  );
}
