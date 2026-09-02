'use client';

import type { SketchCommand } from '@attune/domain';
import { EMPTY_SELECTION_SET, type SelectionSet } from '@attune/domain/editor';
import { LayerCard } from '@cloudflare/kumo';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import { Switch } from '@cloudflare/kumo/components/switch';
import { LiveblocksProvider, RoomProvider, useRoom, useUpdateMyPresence } from '@liveblocks/react';
import { Cursors } from '@liveblocks/react-ui';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  attuneWorkspaceEndpoint,
  requestHumanSemanticMutation,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import { workspaceUserResolver } from '../lib/liveblocks/resolve-users';
import type { SketchTemplate } from '../lib/projects/library';
import { editorChromeCssVariables } from '../lib/sketch/editor-chrome';
import type { EditorCursorMode } from '../lib/sketch/editor-cursors';
import {
  receiptHistoryLabel,
  semanticHistoryLabel,
  SKETCH_HISTORY_COMMANDS,
} from '../lib/sketch/history';
import {
  CLOSED_EDITOR_PANELS,
  toggleEditorPanel,
  type CanvasTool,
  type EditorPanel,
  type EditorPanelState,
} from '../lib/sketch/panel-state';
import { sketchSnapshotFromDocument } from '../lib/sketch/versions';
import { viewportInsetsFor } from '../lib/sketch/viewport-insets';
import type { AttuneCollaborativeDraft } from '../liveblocks.config';
import { AppIcons } from './ui/app-icons';
import { AttuneBrandmark } from './ui/attune-brandmark';
import { Kbd } from './ui/kbd';
import { WorkspaceCanvas } from './workspace-canvas';
import {
  DraftControl,
  HistoryPanel,
  ItemsPanel,
  LiveCommentPins,
  LiveCommentsRail,
  PresenceHeader,
  SketchConstraintsPanel,
  type SketchVersionPreview,
} from './workspace-panels';

function draftFrom(view: AttuneApiView): AttuneCollaborativeDraft {
  return {
    intent: 'Fabricate a custom control-enclosure faceplate with four protected buyer mounts.',
    commitmentId: view.workspace.commitmentId,
    fabricationQuantity: 4,
    geometry: structuredClone(view.workspace.geometry),
    sketchDocument: structuredClone(view.workspace.sketchDocument),
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

function LiveToolPresence({ tool }: { readonly tool: EditorCursorMode }) {
  const updateMyPresence = useUpdateMyPresence();
  useEffect(() => updateMyPresence({ currentTool: tool }), [tool, updateMyPresence]);
  return null;
}

function WorkspaceHeader({
  collaboration,
  projectName,
  onVersionPreview,
}: {
  readonly collaboration: boolean;
  readonly projectName: string;
  readonly onVersionPreview: (preview: SketchVersionPreview | null) => void;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-header-left">
        <LinkButton
          href="/dashboard"
          variant="ghost"
          size="base"
          shape="square"
          icon={<AppIcons.Back size={20} weight="bold" />}
          aria-label="Back to dashboard"
        />
        <span className="workspace-project-icon" aria-hidden>
          <AttuneBrandmark size={18} />
        </span>
        <strong>{projectName}</strong>
      </div>
      <DraftControl collaboration={collaboration} onPreview={onVersionPreview} />
      <div className="workspace-header-right">{collaboration ? <PresenceHeader /> : null}</div>
    </header>
  );
}

function ToolButton({
  label,
  keybind,
  showLabel,
  active,
  disabled,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly keybind?: string;
  readonly showLabel: boolean;
  readonly active: boolean;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}) {
  if (!showLabel) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="base"
        shape="square"
        className="workspace-tool-button"
        icon={icon}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
      />
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="base"
      className="workspace-tool-button px-2"
      icon={icon}
      aria-label={label}
      aria-pressed={active}
      data-active={active || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="workspace-tool-label">{label}</span>
      {keybind ? <Kbd className="shrink-0">{keybind}</Kbd> : null}
    </Button>
  );
}

function WorkspaceTools({
  canvasTool,
  panels,
  collaboration,
  showLabels,
  onCanvasTool,
  onPanel,
}: {
  readonly canvasTool: CanvasTool;
  readonly panels: EditorPanelState;
  readonly collaboration: boolean;
  readonly showLabels: boolean;
  readonly onCanvasTool: (tool: CanvasTool) => void;
  readonly onPanel: (panel: EditorPanel) => void;
}) {
  return (
    <>
      <nav className="workspace-tool-island is-left is-primary" aria-label="Primary tools">
        <ToolButton
          label="Select"
          keybind="/"
          showLabel={showLabels}
          active={panels.leftPanel !== 'comments' && canvasTool === 'select'}
          icon={<AppIcons.Select size={20} weight="regular" />}
          onClick={() => onCanvasTool('select')}
        />
        <ToolButton
          label="Comments"
          showLabel={showLabels}
          active={panels.leftPanel === 'comments'}
          disabled={!collaboration}
          icon={<AppIcons.Comments size={20} weight="regular" />}
          onClick={() => onPanel('comments')}
        />
        <ToolButton
          label="Items"
          showLabel={showLabels}
          active={panels.leftPanel === 'items'}
          icon={<AppIcons.Items size={20} weight="regular" />}
          onClick={() => onPanel('items')}
        />
      </nav>
      <nav className="workspace-tool-island is-left is-geometry" aria-label="Geometry tools">
        {(
          [
            ['line', 'Line', 'L', AppIcons.Line],
            ['rectangle', 'Rectangle', 'R', AppIcons.Rectangle],
            ['circle', 'Circle', 'C', AppIcons.Circle],
            ['arc', 'Arc', 'A', AppIcons.Arc],
            ['ellipse', 'Ellipse', 'E', AppIcons.Ellipse],
            ['bspline', 'B-spline', 'B', AppIcons.BSpline],
            ['trim', 'Trim', 'T', AppIcons.Trim],
          ] as const
        ).map(([geometryTool, label, keybind, Icon]) => (
          <ToolButton
            key={geometryTool}
            label={label}
            keybind={keybind}
            showLabel={showLabels}
            active={canvasTool === geometryTool}
            icon={<Icon size={20} weight="regular" />}
            onClick={() => onCanvasTool(geometryTool)}
          />
        ))}
      </nav>
      <nav className="workspace-tool-island is-right" aria-label="Context tools">
        <ToolButton
          label="Constraints"
          showLabel={showLabels}
          active={panels.rightPanel === 'constraints'}
          icon={<AppIcons.SketchConstraints size={20} weight="regular" />}
          onClick={() => onPanel('constraints')}
        />
        <ToolButton
          label="History"
          showLabel={showLabels}
          active={panels.rightPanel === 'history'}
          icon={<AppIcons.History size={20} weight="regular" />}
          onClick={() => onPanel('history')}
        />
      </nav>
    </>
  );
}

function WorkspaceSettings({
  showLabels,
  autoConstrain,
  profileFill,
  onShowLabelsChange,
  onAutoConstrainChange,
  onProfileFillChange,
}: {
  readonly showLabels: boolean;
  readonly autoConstrain: boolean;
  readonly profileFill: boolean;
  readonly onShowLabelsChange: (show: boolean) => void;
  readonly onAutoConstrainChange: (enabled: boolean) => void;
  readonly onProfileFillChange: (enabled: boolean) => void;
}) {
  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="base"
            shape="square"
            className="workspace-settings-button"
            icon={<AppIcons.Settings size={19} />}
            aria-label="Editor settings"
          />
        }
      />
      <Popover.Content
        side="right"
        align="end"
        sideOffset={8}
        positionMethod="fixed"
        className="workspace-settings-popover"
      >
        <Popover.Title>Editor display</Popover.Title>
        <Switch
          size="base"
          label="Show tool labels"
          checked={showLabels}
          onCheckedChange={onShowLabelsChange}
        />
        <Switch
          size="base"
          label="Auto-constrain"
          checked={autoConstrain}
          onCheckedChange={onAutoConstrainChange}
        />
        <Switch
          size="base"
          label="Profile fill"
          checked={profileFill}
          onCheckedChange={onProfileFillChange}
        />
      </Popover.Content>
    </Popover>
  );
}

function WorkspaceShell({
  workspaceId,
  collaboration,
  perspective,
  actorName,
  projectName,
  template,
}: {
  readonly workspaceId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly actorName: string;
  readonly projectName: string;
  readonly template: SketchTemplate;
}) {
  const [view, setView] = useState<AttuneApiView | null>(null);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select');
  const [selection, setSelection] = useState<SelectionSet>(EMPTY_SELECTION_SET);
  const [panels, setPanels] = useState<EditorPanelState>(CLOSED_EDITOR_PANELS);
  const [showToolLabels, setShowToolLabels] = useState(true);
  const [autoConstrain, setAutoConstrain] = useState(true);
  const [profileFill, setProfileFill] = useState(true);
  const [versionPreview, setVersionPreview] = useState<SketchVersionPreview | null>(null);
  const [optimisticHistory, setOptimisticHistory] = useState<
    readonly {
      readonly id: string;
      readonly workspaceSeq: number;
      readonly label: string;
      readonly actor: string;
      readonly createdAt: string;
    }[]
  >([]);
  const viewRef = useRef<AttuneApiView | null>(null);

  viewRef.current = view;

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

  const insets = viewportInsetsFor(panels, showToolLabels);
  const closeLeftPanel = () => setPanels((current) => ({ ...current, leftPanel: null }));
  const closeRightPanel = () => setPanels((current) => ({ ...current, rightPanel: null }));
  const setPanel = (panel: EditorPanel) =>
    setPanels((current) => toggleEditorPanel(current, panel));
  const setActiveCanvasTool = (tool: CanvasTool) => {
    setCanvasTool(tool);
    setPanels((current) =>
      current.leftPanel === 'comments' ? { ...current, leftPanel: null } : current,
    );
  };
  const draftVersion = view?.workspace.draftVersion ?? 1;
  const specHash = view?.specHash ?? `draft:${workspaceId}`;
  const cursorMode: EditorCursorMode =
    panels.leftPanel === 'comments'
      ? 'comment'
      : canvasTool !== 'select' && canvasTool !== 'trim'
        ? 'draw'
        : panels.rightPanel === 'constraints'
          ? 'constraint'
          : 'select';

  const applySketchCommand = useCallback(
    async (command: SketchCommand) => {
      const current = viewRef.current;
      if (!current) throw new Error('The authoritative sketch is not loaded.');
      const historyLabel = semanticHistoryLabel(command, current.workspace.sketchDocument);
      const applied = await requestHumanSemanticMutation(
        attuneWorkspaceEndpoint('/api/attune/human', workspaceId),
        current,
        command,
      );
      const next: AttuneApiView = {
        ...current,
        specHash: applied.mutation.specificationHash,
        workspace: applied.workspace,
        semantic: {
          ...current.semantic,
          documentRevision: applied.workspace.sketchDocument.revision,
          solve: applied.workspace.sketchDocument.lastSolve ?? null,
        },
      };
      viewRef.current = next;
      setView(next);
      setOptimisticHistory((events) => [
        {
          id: `history:${applied.mutation.workspaceSequence}`,
          workspaceSeq: applied.mutation.workspaceSequence,
          label: historyLabel,
          actor: actorName,
          createdAt: new Date().toISOString(),
        },
        ...events.filter(({ workspaceSeq }) => workspaceSeq !== applied.mutation.workspaceSequence),
      ]);
      window.dispatchEvent(new Event('attune:workspace-changed'));
      void refresh();
      return applied.workspace.sketchDocument;
    },
    [actorName, refresh, workspaceId],
  );

  const receiptSequences = new Set(view?.records.receipts.map(({ workspaceSeq }) => workspaceSeq));
  const historyEvents = [
    ...optimisticHistory.filter(({ workspaceSeq }) => !receiptSequences.has(workspaceSeq)),
    ...(view?.records.receipts ?? [])
      .filter(({ command }) => SKETCH_HISTORY_COMMANDS.has(command))
      .map((receipt) => ({
        id: receipt.receiptId,
        workspaceSeq: receipt.workspaceSeq,
        label: receiptHistoryLabel(receipt.command),
        actor: receipt.origin === 'webmcp' ? 'Agent' : actorName,
        createdAt: receipt.createdAt,
      })),
  ].toSorted(
    (left, right) =>
      right.workspaceSeq - left.workspaceSeq || right.createdAt.localeCompare(left.createdAt),
  );

  const canvas = (
    <WorkspaceCanvas
      insets={insets}
      projectName={projectName}
      cursorMode={cursorMode}
      tool={canvasTool}
      document={versionPreview?.document ?? view?.workspace.sketchDocument ?? null}
      selection={selection}
      autoConstrain={autoConstrain}
      profileFill={profileFill}
      readOnly={versionPreview !== null}
      onSelectionChange={setSelection}
      onToolChange={setActiveCanvasTool}
      onCommand={perspective === 'buyer' && !versionPreview ? applySketchCommand : undefined}
      renderComments={
        collaboration && panels.leftPanel === 'comments'
          ? (camera, placement) => (
              <LiveCommentPins
                workspaceId={workspaceId}
                camera={camera}
                placement={placement}
                draftVersion={draftVersion}
                specHash={specHash}
              />
            )
          : undefined
      }
    />
  );

  return (
    <main
      className="workspace-shell"
      data-left-panel-open={panels.leftPanel !== null}
      data-right-panel-open={panels.rightPanel !== null}
      data-tool-labels={showToolLabels}
      style={editorChromeCssVariables}
    >
      {collaboration ? (
        <Cursors className="workspace-live-cursors attune-liveblocks-bridge">{canvas}</Cursors>
      ) : (
        canvas
      )}
      {collaboration ? <LiveToolPresence tool={cursorMode} /> : null}
      <WorkspaceHeader
        collaboration={collaboration}
        projectName={projectName}
        onVersionPreview={setVersionPreview}
      />
      {versionPreview ? (
        <output className="workspace-version-preview">
          <span>
            Viewing version from{' '}
            {new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(versionPreview.createdAt)}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setVersionPreview(null)}>
            Back to current
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              void applySketchCommand({
                type: 'restore_sketch',
                snapshot: sketchSnapshotFromDocument(versionPreview.document),
              }).then(() => setVersionPreview(null));
            }}
          >
            Restore this version
          </Button>
        </output>
      ) : null}
      <LayerCard render={<section />} className="workspace-mobile-notice" aria-live="polite">
        <p>Attune's editor works best on a larger screen.</p>
      </LayerCard>
      <WorkspaceTools
        canvasTool={canvasTool}
        panels={panels}
        collaboration={collaboration}
        showLabels={showToolLabels}
        onCanvasTool={setActiveCanvasTool}
        onPanel={setPanel}
      />
      <WorkspaceSettings
        showLabels={showToolLabels}
        autoConstrain={autoConstrain}
        profileFill={profileFill}
        onShowLabelsChange={setShowToolLabels}
        onAutoConstrainChange={setAutoConstrain}
        onProfileFillChange={setProfileFill}
      />
      <ItemsPanel
        open={panels.leftPanel === 'items'}
        projectName={projectName}
        template={template}
        document={view?.workspace.sketchDocument ?? null}
        selection={selection}
        onSelectionChange={setSelection}
        onCommand={perspective === 'buyer' ? applySketchCommand : undefined}
        onClose={closeLeftPanel}
      />
      {collaboration ? (
        <LiveCommentsRail
          open={panels.leftPanel === 'comments'}
          workspaceId={workspaceId}
          onClose={closeLeftPanel}
        />
      ) : null}
      <SketchConstraintsPanel
        open={panels.rightPanel === 'constraints'}
        document={view?.workspace.sketchDocument ?? null}
        selection={selection}
        onCommand={perspective === 'buyer' ? applySketchCommand : undefined}
        onClose={closeRightPanel}
      />
      <HistoryPanel
        open={panels.rightPanel === 'history'}
        events={historyEvents}
        onClose={closeRightPanel}
      />
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
        actorName={actor.name}
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
          actorName={actor.name}
          projectName={projectName}
          template={template}
        />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
