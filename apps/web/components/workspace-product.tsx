'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Tooltip } from '@cloudflare/kumo/components/tooltip';
import { LiveblocksProvider, RoomProvider, useRoom } from '@liveblocks/react';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  attuneWorkspaceEndpoint,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import { workspaceUserResolver } from '../lib/liveblocks/resolve-users';
import { viewportInsetsFor, type OverlayPanel } from '../lib/sketch/viewport-insets';
import type { AttuneCollaborativeDraft } from '../liveblocks.config';
import { AppIcons } from './ui/app-icons';
import { WorkspaceCanvas, type WorkspaceCanvasHandle } from './workspace-canvas';
import {
  DraftControl,
  ItemsPanel,
  LiveCommentPins,
  LiveCommentsRail,
  LiveHistoryPanel,
  LocalHistoryPanel,
  PresenceHeader,
  SketchConstraintsPanel,
  ViewPanel,
} from './workspace-panels';

type WorkspaceTool = 'select' | 'sketch' | OverlayPanel;

function draftFrom(view: AttuneApiView): AttuneCollaborativeDraft {
  return {
    intent: 'Fabricate a custom control-enclosure faceplate with four protected buyer mounts.',
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

function YjsDraftBridge({
  workspaceId,
  perspective,
}: {
  readonly workspaceId: string;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
}) {
  const room = useRoom();
  const provider = useMemo(() => getYjsProviderForRoom(room), [room]);

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      const path = perspective === 'provider' ? '/api/attune/provider' : '/api/attune/human';
      const view = await requestAttuneView(attuneWorkspaceEndpoint(path, workspaceId));
      if (!active) return;
      const map = provider.getYDoc().getMap('attune');
      const next = draftFrom(view);
      if (JSON.stringify(map.get('draft')) !== JSON.stringify(next)) map.set('draft', next);
    };
    void synchronize();
    return () => {
      active = false;
    };
  }, [perspective, provider, workspaceId]);

  return null;
}

function WorkspaceHeader({ collaboration }: { readonly collaboration: boolean }) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-left">
        <Link href="/dashboard" aria-label="Back to dashboard">
          <AppIcons.Back size={20} weight="bold" />
        </Link>
        <span className="workspace-project-icon" aria-hidden>
          <AppIcons.Brand size={18} weight="bold" />
        </span>
        <strong>Spoke sketch</strong>
      </div>
      <DraftControl collaboration={collaboration} />
      <div className="workspace-header-right">
        {collaboration ? <PresenceHeader /> : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          shape="square"
          icon={<AppIcons.More size={20} weight="bold" />}
          aria-label="More project actions"
        />
      </div>
    </header>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}) {
  return (
    <Tooltip
      content={label}
      render={
        <Button
          type="button"
          variant={active ? 'secondary' : 'ghost'}
          size="sm"
          shape="square"
          icon={icon}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        />
      }
    />
  );
}

function WorkspaceTools({
  activeTool,
  collaboration,
  onTool,
}: {
  readonly activeTool: WorkspaceTool;
  readonly collaboration: boolean;
  readonly onTool: (tool: WorkspaceTool) => void;
}) {
  return (
    <>
      <nav className="workspace-tool-island is-left" aria-label="Sketch tools">
        <ToolButton
          label="Select"
          active={activeTool === 'select'}
          icon={<AppIcons.Select size={20} weight="regular" />}
          onClick={() => onTool('select')}
        />
        <ToolButton
          label="Sketch tools"
          active={activeTool === 'sketch'}
          icon={<AppIcons.Sketch size={20} weight="regular" />}
          onClick={() => onTool('sketch')}
        />
        <span className="workspace-tool-divider" />
        <ToolButton
          label="Comments"
          active={activeTool === 'comments'}
          disabled={!collaboration}
          icon={<AppIcons.Comments size={20} weight="regular" />}
          onClick={() => onTool('comments')}
        />
        <ToolButton
          label="Items"
          active={activeTool === 'items'}
          icon={<AppIcons.Items size={20} weight="regular" />}
          onClick={() => onTool('items')}
        />
      </nav>
      <nav className="workspace-tool-island is-right" aria-label="Workspace panels">
        <ToolButton
          label="View"
          active={activeTool === 'view'}
          icon={<AppIcons.View size={20} weight="regular" />}
          onClick={() => onTool('view')}
        />
        <ToolButton
          label="Sketch Constraints"
          active={activeTool === 'constraints'}
          icon={<AppIcons.SketchConstraints size={20} weight="regular" />}
          onClick={() => onTool('constraints')}
        />
        <ToolButton
          label="History"
          active={activeTool === 'history'}
          icon={<AppIcons.History size={20} weight="regular" />}
          onClick={() => onTool('history')}
        />
      </nav>
    </>
  );
}

function WorkspaceShell({
  workspaceId,
  collaboration,
  perspective,
}: {
  readonly workspaceId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
}) {
  const [view, setView] = useState<AttuneApiView | null>(null);
  const [activeTool, setActiveTool] = useState<WorkspaceTool>('select');
  const canvasRef = useRef<WorkspaceCanvasHandle>(null);

  const refresh = useCallback(async () => {
    const path = perspective === 'provider' ? '/api/attune/provider' : '/api/attune/human';
    try {
      setView(await requestAttuneView(attuneWorkspaceEndpoint(path, workspaceId)));
    } catch {
      setView(null);
    }
  }, [perspective, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const panel: OverlayPanel =
    activeTool === 'comments' ||
    activeTool === 'items' ||
    activeTool === 'view' ||
    activeTool === 'constraints' ||
    activeTool === 'history'
      ? activeTool
      : null;
  const insets = viewportInsetsFor(panel);
  const closePanel = () => setActiveTool('select');
  const setTool = (tool: WorkspaceTool) =>
    setActiveTool((current) => (current === tool ? 'select' : tool));
  const draftVersion = view?.workspace.draftVersion ?? 1;
  const specHash = view?.specHash ?? 'draft:spoke-sketch';

  return (
    <main className="workspace-shell">
      <WorkspaceCanvas
        ref={canvasRef}
        insets={insets}
        comments={
          collaboration && activeTool === 'comments' ? (
            <LiveCommentPins workspaceId={workspaceId} />
          ) : undefined
        }
      />
      <WorkspaceHeader collaboration={collaboration} />
      <WorkspaceTools activeTool={activeTool} collaboration={collaboration} onTool={setTool} />
      {activeTool === 'items' ? <ItemsPanel onClose={closePanel} /> : null}
      {activeTool === 'comments' && collaboration ? (
        <LiveCommentsRail
          workspaceId={workspaceId}
          draftVersion={draftVersion}
          specHash={specHash}
          onClose={closePanel}
        />
      ) : null}
      {activeTool === 'view' ? (
        <ViewPanel
          onClose={closePanel}
          onFit={() => canvasRef.current?.fitSketch()}
          onReset={() => canvasRef.current?.resetView()}
        />
      ) : null}
      {activeTool === 'constraints' ? <SketchConstraintsPanel onClose={closePanel} /> : null}
      {activeTool === 'history' ? (
        collaboration ? (
          <LiveHistoryPanel onClose={closePanel} />
        ) : (
          <LocalHistoryPanel onClose={closePanel} />
        )
      ) : null}
    </main>
  );
}

export function WorkspaceProduct({
  workspaceId,
  roomId,
  collaboration,
  perspective,
  actor,
}: {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly judgeMode: boolean;
  readonly actor: { readonly id: string; readonly name: string; readonly role: CapabilityRole };
}) {
  const resolver = useMemo(() => workspaceUserResolver(roomId), [roomId]);
  if (!collaboration) {
    return (
      <WorkspaceShell workspaceId={workspaceId} collaboration={false} perspective={perspective} />
    );
  }
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" resolveUsers={resolver}>
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null, selection: [], currentTool: 'select', activeActor: actor }}
      >
        <YjsDraftBridge workspaceId={workspaceId} perspective={perspective} />
        <WorkspaceShell workspaceId={workspaceId} collaboration perspective={perspective} />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
