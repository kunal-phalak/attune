'use client';

import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown';
import { Tooltip } from '@cloudflare/kumo/components/tooltip';
import { LiveblocksProvider, RoomProvider, useRoom } from '@liveblocks/react';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  attuneWorkspaceEndpoint,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import { workspaceUserResolver } from '../lib/liveblocks/resolve-users';
import type { SketchTemplate } from '../lib/projects/library';
import {
  panelForTool,
  panelSide,
  toggleEditorTool,
  type EditorTool,
} from '../lib/sketch/panel-state';
import { viewportInsetsFor } from '../lib/sketch/viewport-insets';
import type { AttuneCollaborativeDraft } from '../liveblocks.config';
import { AppIcons } from './ui/app-icons';
import { WorkspaceCanvas } from './workspace-canvas';
import {
  DraftControl,
  HistoryPanel,
  ItemsPanel,
  LiveCommentPins,
  LiveCommentsRail,
  PresenceHeader,
  SketchConstraintsPanel,
} from './workspace-panels';

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

function WorkspaceHeader({
  collaboration,
  projectName,
}: {
  readonly collaboration: boolean;
  readonly projectName: string;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-left">
        <LinkButton
          href="/dashboard"
          variant="ghost"
          size="sm"
          shape="square"
          icon={<AppIcons.Back size={20} weight="bold" />}
          aria-label="Back to dashboard"
        />
        <span className="workspace-project-icon" aria-hidden>
          <AppIcons.Brand size={18} weight="bold" />
        </span>
        <strong>{projectName}</strong>
      </div>
      <DraftControl collaboration={collaboration} />
      <div className="workspace-header-right">
        {collaboration ? <PresenceHeader /> : null}
        <DropdownMenu>
          <DropdownMenu.Trigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                shape="square"
                icon={<AppIcons.More size={20} weight="bold" />}
                aria-label="More project actions"
              />
            }
          />
          <DropdownMenu.Content align="end" sideOffset={8}>
            <DropdownMenu.LinkItem href="/dashboard" icon={AppIcons.Back}>
              Back to projects
            </DropdownMenu.LinkItem>
          </DropdownMenu.Content>
        </DropdownMenu>
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
  readonly activeTool: EditorTool;
  readonly collaboration: boolean;
  readonly onTool: (tool: EditorTool) => void;
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
      <nav className="workspace-tool-island is-right" aria-label="Context tools">
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
  projectName,
  template,
}: {
  readonly workspaceId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly projectName: string;
  readonly template: SketchTemplate;
}) {
  const [view, setView] = useState<AttuneApiView | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>('select');

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

  const panel = panelForTool(activeTool);
  const side = panelSide(panel);
  const insets = viewportInsetsFor(panel);
  const closePanel = () => setActiveTool('select');
  const setTool = (tool: EditorTool) => setActiveTool((current) => toggleEditorTool(current, tool));
  const draftVersion = view?.workspace.draftVersion ?? 1;
  const specHash = view?.specHash ?? `draft:${workspaceId}`;

  return (
    <main
      className="workspace-shell"
      data-left-panel-open={side === 'left'}
      data-right-panel-open={side === 'right'}
    >
      <WorkspaceCanvas
        insets={insets}
        projectName={projectName}
        template={template}
        comments={
          collaboration && activeTool === 'comments' ? (
            <LiveCommentPins workspaceId={workspaceId} />
          ) : undefined
        }
      />
      <WorkspaceHeader collaboration={collaboration} projectName={projectName} />
      <WorkspaceTools activeTool={activeTool} collaboration={collaboration} onTool={setTool} />
      <ItemsPanel
        open={activeTool === 'items'}
        projectName={projectName}
        template={template}
        onClose={closePanel}
      />
      {collaboration ? (
        <LiveCommentsRail
          open={activeTool === 'comments'}
          workspaceId={workspaceId}
          draftVersion={draftVersion}
          specHash={specHash}
          onClose={closePanel}
        />
      ) : null}
      <SketchConstraintsPanel open={activeTool === 'constraints'} onClose={closePanel} />
      <HistoryPanel open={activeTool === 'history'} events={[]} onClose={closePanel} />
    </main>
  );
}

export function WorkspaceProduct({
  workspaceId,
  roomId,
  collaboration,
  perspective,
  actor,
  projectName,
  template,
}: {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly actor: { readonly id: string; readonly name: string; readonly role: CapabilityRole };
  readonly projectName: string;
  readonly template: SketchTemplate;
}) {
  const resolver = useMemo(() => workspaceUserResolver(roomId), [roomId]);
  if (!collaboration) {
    return (
      <WorkspaceShell
        workspaceId={workspaceId}
        collaboration={false}
        perspective={perspective}
        projectName={projectName}
        template={template}
      />
    );
  }
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" resolveUsers={resolver}>
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null, selection: [], currentTool: 'select', activeActor: actor }}
      >
        <YjsDraftBridge workspaceId={workspaceId} perspective={perspective} />
        <WorkspaceShell
          workspaceId={workspaceId}
          collaboration
          perspective={perspective}
          projectName={projectName}
          template={template}
        />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
