'use client';

import type { SketchCommand } from '@attune/domain';
import { EMPTY_SELECTION_SET, type SelectionSet } from '@attune/domain/editor';
import { LayerCard } from '@cloudflare/kumo';
import { Button, LinkButton } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import { Switch } from '@cloudflare/kumo/components/switch';
import { Toasty } from '@cloudflare/kumo/components/toast';
import { Toolbar } from '@cloudflare/kumo/components/toolbar';
import { Tooltip, TooltipProvider } from '@cloudflare/kumo/components/tooltip';
import { LiveblocksProvider, RoomProvider, useRoom, useUpdateMyPresence } from '@liveblocks/react';
import { Cursors } from '@liveblocks/react-ui';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from 'react';

import {
  attuneWorkspaceEndpoint,
  requestHumanSemanticMutation,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import { workspaceUserResolver } from '../lib/liveblocks/resolve-users';
import { editorChromeCssVariables } from '../lib/sketch/editor-chrome';
import type { EditorCursorMode } from '../lib/sketch/editor-cursors';
import { editorToastManager } from '../lib/sketch/editor-toast';
import {
  receiptHistoryLabel,
  semanticHistoryLabel,
  SKETCH_HISTORY_COMMANDS,
} from '../lib/sketch/history';
import {
  CLOSED_EDITOR_PANELS,
  toggleEditorPanel,
  type CanvasTool,
  type ConstraintTool,
  type EditorPanel,
  type EditorPanelState,
} from '../lib/sketch/panel-state';
import { sketchSnapshotFromDocument } from '../lib/sketch/versions';
import { viewportInsetsFor } from '../lib/sketch/viewport-insets';
import type { AttuneCollaborativeDraft } from '../liveblocks.config';
import { AttuneWebMcp } from './attune-webmcp';
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

function LiveToolPresence({ tool }: { readonly tool: EditorCursorMode }) {
  const updateMyPresence = useUpdateMyPresence();
  useEffect(() => updateMyPresence({ currentTool: tool }), [tool, updateMyPresence]);
  return null;
}

function WorkspaceHeader({
  collaboration,
  projectName,
  onVersionPreview,
  onSaveVersion,
}: {
  readonly collaboration: boolean;
  readonly projectName: string;
  readonly onVersionPreview: (preview: SketchVersionPreview | null) => void;
  readonly onSaveVersion?: () => Promise<void>;
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
      <DraftControl
        collaboration={collaboration}
        onPreview={onVersionPreview}
        onSaveVersion={onSaveVersion}
      />
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
  const control = (
    <Toolbar.Button
      type="button"
      shape={showLabel ? 'base' : 'square'}
      className={showLabel ? 'workspace-tool-button px-2' : 'workspace-tool-button'}
      icon={icon}
      aria-label={label}
      aria-pressed={active}
      data-active={active || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {showLabel ? <span className="workspace-tool-label">{label}</span> : null}
      {showLabel && keybind ? <Kbd className="shrink-0">{keybind}</Kbd> : null}
    </Toolbar.Button>
  );
  return (
    <Tooltip content={keybind && !showLabel ? `${label} (${keybind})` : label} render={control} />
  );
}

function WorkspaceTools({
  canvasTool,
  constraintTool,
  panels,
  collaboration,
  showLabels,
  onCanvasTool,
  onConstraintTool,
  onPanel,
}: {
  readonly canvasTool: CanvasTool;
  readonly constraintTool: ConstraintTool | null;
  readonly panels: EditorPanelState;
  readonly collaboration: boolean;
  readonly showLabels: boolean;
  readonly onCanvasTool: (tool: CanvasTool) => void;
  readonly onConstraintTool: (tool: ConstraintTool | null) => void;
  readonly onPanel: (panel: EditorPanel) => void;
}) {
  return (
    <TooltipProvider>
      <Toolbar
        orientation="vertical"
        className="workspace-tool-island is-left is-primary"
        aria-label="Primary tools"
      >
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
      </Toolbar>
      <Toolbar
        orientation="vertical"
        className="workspace-tool-island is-left is-geometry"
        aria-label="Geometry tools"
      >
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
      </Toolbar>
      <Toolbar
        orientation="vertical"
        className="workspace-tool-island is-right is-context"
        aria-label="Context tools"
      >
        <ToolButton
          label="History"
          showLabel={showLabels}
          active={panels.rightPanel === 'history'}
          icon={<AppIcons.History size={20} weight="regular" />}
          onClick={() => onPanel('history')}
        />
      </Toolbar>
      <Toolbar
        orientation="vertical"
        className="workspace-tool-island is-right is-constraints"
        aria-label="Constraint tools"
      >
        {(
          [
            [
              'coincident',
              'Coincident',
              AppIcons.Coincident,
              'Choose two points, or a point and line',
            ],
            ['horizontal', 'Horizontal', AppIcons.Horizontal, 'Choose a line'],
            ['vertical', 'Vertical', AppIcons.Vertical, 'Choose a line'],
            ['parallel', 'Parallel', AppIcons.Parallel, 'Choose two lines'],
            ['perpendicular', 'Perpendicular', AppIcons.Perpendicular, 'Choose two lines'],
            ['tangent', 'Tangent', AppIcons.Tangent, 'Choose two compatible curves'],
            ['concentric', 'Concentric', AppIcons.Concentric, 'Choose two circles or arcs'],
            ['equal', 'Equal', AppIcons.Equal, 'Choose two lines, or two circles/arcs'],
            ['fixed', 'Fix / Unfix', AppIcons.Fixed, 'Choose geometry'],
          ] as const
        ).map(([type, label, Icon, instruction]) => (
          <Tooltip
            key={type}
            side="left"
            content={`${label} — ${instruction.toLowerCase()}`}
            render={
              <Toolbar.Button
                type="button"
                shape={showLabels ? 'base' : 'square'}
                className={showLabels ? 'workspace-tool-button px-2' : 'workspace-tool-button'}
                icon={<Icon size={20} weight="regular" />}
                aria-label={`${label} — ${instruction}`}
                aria-pressed={constraintTool === type}
                data-active={constraintTool === type || undefined}
                onClick={() => onConstraintTool(constraintTool === type ? null : type)}
              >
                {showLabels ? <span className="workspace-tool-label">{label}</span> : null}
              </Toolbar.Button>
            }
          />
        ))}
      </Toolbar>
      <Toolbar
        orientation="vertical"
        className="workspace-tool-island is-right is-dimensions"
        aria-label="Dimension tools"
      >
        {(
          [
            ['distance', 'Distance', AppIcons.Dimension, 'Choose a line'],
            ['radius', 'Radius', AppIcons.Radius, 'Choose a circle or arc'],
            ['diameter', 'Diameter', AppIcons.Dimension, 'Choose a circle or arc'],
          ] as const
        ).map(([type, label, Icon, instruction]) => (
          <Tooltip
            key={type}
            side="left"
            content={`${label} — ${instruction.toLowerCase()}`}
            render={
              <Toolbar.Button
                type="button"
                shape={showLabels ? 'base' : 'square'}
                className={showLabels ? 'workspace-tool-button px-2' : 'workspace-tool-button'}
                icon={<Icon size={20} weight="regular" />}
                aria-label={`${label} — ${instruction}`}
                aria-pressed={constraintTool === type}
                data-active={constraintTool === type || undefined}
                onClick={() => onConstraintTool(constraintTool === type ? null : type)}
              >
                {showLabels ? <span className="workspace-tool-label">{label}</span> : null}
              </Toolbar.Button>
            }
          />
        ))}
      </Toolbar>
    </TooltipProvider>
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
  initialView,
  onAuthoritativeView,
  onSaveVersion,
}: {
  readonly workspaceId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly actorName: string;
  readonly projectName: string;
  readonly initialView: AttuneApiView;
  readonly onAuthoritativeView?: (view: AttuneApiView) => void;
  readonly onSaveVersion?: () => Promise<void>;
}) {
  const [view, setView] = useState<AttuneApiView | null>(initialView);
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('select');
  const [constraintTool, setConstraintTool] = useState<ConstraintTool | null>(null);
  const [selection, setSelection] = useState<SelectionSet>(EMPTY_SELECTION_SET);
  const [panels, setPanels] = useState<EditorPanelState>(CLOSED_EDITOR_PANELS);
  const [showToolLabels, setShowToolLabels] = useState(true);
  const [autoConstrain, setAutoConstrain] = useState(true);
  const [profileFill, setProfileFill] = useState(true);
  const [panelWidths, setPanelWidths] = useState({ left: 288, right: 288 });
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
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  viewRef.current = view;

  useEffect(() => {
    onAuthoritativeView?.(initialView);
  }, [initialView, onAuthoritativeView]);

  const insets = viewportInsetsFor(panels, showToolLabels, panelWidths);
  const closeLeftPanel = () => setPanels((current) => ({ ...current, leftPanel: null }));
  const closeRightPanel = () => setPanels((current) => ({ ...current, rightPanel: null }));
  const setPanel = (panel: EditorPanel) =>
    setPanels((current) => toggleEditorPanel(current, panel));
  const setActiveCanvasTool = (tool: CanvasTool) => {
    setCanvasTool(tool);
    setConstraintTool(null);
    setPanels((current) =>
      current.leftPanel === 'comments' ? { ...current, leftPanel: null } : current,
    );
  };
  const setActiveConstraintTool = (tool: ConstraintTool | null) => {
    setConstraintTool(tool);
    if (tool) {
      setCanvasTool('select');
      setSelection(EMPTY_SELECTION_SET);
    }
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
        : constraintTool
          ? 'constraint'
          : 'select';

  const applySketchCommand = useCallback(
    (command: SketchCommand) => {
      const execute = async () => {
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
        onAuthoritativeView?.(next);
        setOptimisticHistory((events) => [
          {
            id: `history:${applied.mutation.workspaceSequence}`,
            workspaceSeq: applied.mutation.workspaceSequence,
            label: historyLabel,
            actor: actorName,
            createdAt: new Date().toISOString(),
          },
          ...events.filter(
            ({ workspaceSeq }) => workspaceSeq !== applied.mutation.workspaceSequence,
          ),
        ]);
        window.dispatchEvent(new CustomEvent('attune:workspace-changed', { detail: next }));
        return applied.workspace.sketchDocument;
      };
      const pending = mutationQueueRef.current.then(execute);
      mutationQueueRef.current = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    [actorName, onAuthoritativeView, workspaceId],
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
      constraintTool={constraintTool}
      document={versionPreview?.document ?? view?.workspace.sketchDocument ?? null}
      selection={selection}
      autoConstrain={autoConstrain}
      profileFill={profileFill}
      readOnly={versionPreview !== null}
      onSelectionChange={setSelection}
      onToolChange={setActiveCanvasTool}
      onConstraintToolChange={setActiveConstraintTool}
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
    <Toasty toastManager={editorToastManager}>
      <main
        className="workspace-shell"
        data-left-panel-open={panels.leftPanel !== null}
        data-right-panel-open={panels.rightPanel !== null}
        data-tool-labels={showToolLabels}
        style={
          {
            ...editorChromeCssVariables,
            '--editor-left-panel-width': `${panelWidths.left}px`,
            '--editor-right-panel-width': `${panelWidths.right}px`,
          } as CSSProperties
        }
      >
        <AttuneWebMcp
          workspaceId={workspaceId}
          perspective={perspective}
          initialView={initialView}
        />
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
          onSaveVersion={onSaveVersion}
        />
        {versionPreview ? (
          <output className="workspace-version-preview">
            <span>
              Viewing version from{' '}
              {new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(
                versionPreview.createdAt,
              )}
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
          constraintTool={constraintTool}
          panels={panels}
          collaboration={collaboration}
          showLabels={showToolLabels}
          onCanvasTool={setActiveCanvasTool}
          onConstraintTool={setActiveConstraintTool}
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
          document={view?.workspace.sketchDocument ?? null}
          selection={selection}
          onSelectionChange={setSelection}
          onCommand={perspective === 'buyer' ? applySketchCommand : undefined}
          onClose={closeLeftPanel}
          onWidthChange={(left) => setPanelWidths((current) => ({ ...current, left }))}
        />
        {collaboration ? (
          <LiveCommentsRail
            open={panels.leftPanel === 'comments'}
            workspaceId={workspaceId}
            onClose={closeLeftPanel}
            onWidthChange={(left) => setPanelWidths((current) => ({ ...current, left }))}
          />
        ) : null}
        <HistoryPanel
          open={panels.rightPanel === 'history'}
          events={historyEvents}
          onClose={closeRightPanel}
          onWidthChange={(right) => setPanelWidths((current) => ({ ...current, right }))}
        />
      </main>
    </Toasty>
  );
}

function CollaborativeWorkspaceShell({
  roomId,
  ...props
}: Omit<
  ComponentProps<typeof WorkspaceShell>,
  'collaboration' | 'onAuthoritativeView' | 'onSaveVersion'
> & { readonly roomId: string }) {
  const room = useRoom();
  const provider = useMemo(() => getYjsProviderForRoom(room), [room]);
  const saveVersion = useCallback(async () => {
    try {
      const response = await fetch('/api/liveblocks-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, workspaceId: props.workspaceId }),
      });
      if (!response.ok) throw new Error('The synchronized draft could not be versioned.');
      editorToastManager.add({
        variant: 'success',
        title: 'Version saved',
        description: 'The current synchronized draft is now available in version history.',
      });
    } catch (error) {
      editorToastManager.add({
        variant: 'error',
        title: 'Version not saved',
        description: error instanceof Error ? error.message : 'Try again after synchronization.',
      });
      throw error;
    }
  }, [props.workspaceId, roomId]);
  const mirrorAuthoritativeView = useCallback(
    (view: AttuneApiView) => {
      try {
        const map = provider.getYDoc().getMap('attune');
        const next = draftFrom(view);
        if (JSON.stringify(map.get('draft')) !== JSON.stringify(next)) map.set('draft', next);
      } catch {
        editorToastManager.add({
          variant: 'warning',
          title: 'Sketch saved',
          description: 'Collaboration sync is delayed. Your saved sketch is intact.',
        });
      }
    },
    [provider],
  );
  return (
    <WorkspaceShell
      {...props}
      collaboration
      onAuthoritativeView={mirrorAuthoritativeView}
      onSaveVersion={saveVersion}
    />
  );
}

export function WorkspaceProduct({
  workspaceId,
  roomId,
  collaboration,
  perspective,
  actor,
  projectName,
  initialView,
}: {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly actor: { readonly id: string; readonly name: string; readonly role: CapabilityRole };
  readonly projectName: string;
  readonly initialView: AttuneApiView;
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
        initialView={initialView}
      />
    );
  }
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth" resolveUsers={resolver}>
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null, selection: [], currentTool: 'select', activeActor: actor }}
      >
        <CollaborativeWorkspaceShell
          roomId={roomId}
          workspaceId={workspaceId}
          perspective={perspective}
          actorName={actor.name}
          projectName={projectName}
          initialView={initialView}
        />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
