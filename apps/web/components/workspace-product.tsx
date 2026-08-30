'use client';

import { LiveblocksProvider, RoomProvider, useRoom } from '@liveblocks/react';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AttuneHttpError,
  attuneWorkspaceEndpoint,
  commandRequestBody,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import type { AttuneCollaborativeDraft } from '../liveblocks.config';
import { AttuneWebMcp, type AttuneWebMcpStatus } from './attune-webmcp';
import { WorkspaceCanvas } from './workspace-canvas';
import {
  BottomDock,
  CollaborationHeader,
  InspectorPanel,
  ItemsPanel,
  LifecycleStrip,
  type DockTab,
  type InspectorTab,
  type WorkflowAction,
} from './workspace-panels';

type ProductState = 'loading' | 'ready' | 'applying' | 'failed';

const initialWebMcpStatus: AttuneWebMcpStatus = {
  registration: 'checking',
  execution: 'idle',
  lastAction: null,
  workspaceSeq: null,
  draftVersion: null,
  availableTools: [],
  interventions: 0,
};

function available(view: AttuneApiView, role: CapabilityRole, id: string): boolean {
  return view.frontiers[role].some((entry) => entry.id === id && entry.available);
}

function draftFrom(view: AttuneApiView): AttuneCollaborativeDraft {
  return {
    intent: 'Fabricate a custom equipment panel with four protected buyer mounts.',
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

function YjsDraftBridge({ workspaceId }: { readonly workspaceId: string }) {
  const room = useRoom();
  const provider = useMemo(() => getYjsProviderForRoom(room), [room]);

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      const view = await requestAttuneView(
        attuneWorkspaceEndpoint('/api/attune/human', workspaceId),
      );
      if (!active) return;
      const map = provider.getYDoc().getMap('attune');
      const next = draftFrom(view);
      if (JSON.stringify(map.get('draft')) !== JSON.stringify(next)) map.set('draft', next);
    };
    void synchronize();
    const onChange = () => void synchronize();
    window.addEventListener('attune:workspace-changed', onChange);
    return () => {
      active = false;
      window.removeEventListener('attune:workspace-changed', onChange);
    };
  }, [provider, workspaceId]);

  return null;
}

function workflowAction(view: AttuneApiView): WorkflowAction | null {
  const quote = view.workspace.quotes.find(
    (candidate) =>
      candidate.revisionId === `r${view.workspace.draftVersion}` &&
      candidate.specHash === view.specHash,
  );
  if (available(view, 'buyer', 'request_quote'))
    return {
      label: 'Request exact quote',
      path: '/api/attune/human',
      prefix: 'buyer',
      command: { type: 'request_quote' },
    };
  if (available(view, 'provider', 'freeze_and_quote_revision'))
    return {
      label: `Freeze + quote exact r${view.workspace.draftVersion}`,
      path: '/api/attune/provider',
      prefix: 'provider',
      command: { type: 'freeze_and_quote_revision' },
    };
  if (available(view, 'buyer', 'accept_revision') && quote)
    return {
      label: `Accept exact ${quote.revisionId}`,
      path: '/api/attune/human',
      prefix: 'buyer',
      command: { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
    };
  if (available(view, 'agent', 'materialize_for_commerce'))
    return {
      label: 'Materialize + verify Shopify',
      path: '/api/attune/webmcp',
      prefix: 'agent',
      command: { type: 'materialize_for_commerce', revisionId: `r${view.workspace.draftVersion}` },
    };
  if (available(view, 'agent', 'navigate_to_storefront') && view.workspace.draftVersion === 7)
    return {
      label: 'Continue work as draft r8',
      path: '/api/attune/human',
      prefix: 'buyer',
      command: { type: 'move_slot', centerX: 195, centerY: 60 },
    };
  return null;
}

function ProjectMark() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M5 6h18v16H5zM9 10h10v8H9z" />
      <circle cx="7" cy="8" r="1.5" />
      <circle cx="21" cy="20" r="1.5" />
    </svg>
  );
}

function ShareDialog({ onClose }: { readonly onClose: () => void }) {
  return (
    <div className="workspace-modal-backdrop" role="presentation" onPointerDown={onClose}>
      <dialog
        open
        className="workspace-modal"
        aria-labelledby="share-dialog-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Workspace access</span>
            <h2 id="share-dialog-title">Share AT-1042</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close share dialog">
            ×
          </button>
        </header>
        <div className="share-dialog-body">
          <p>
            Membership and business roles are verified by the server. Sharing this browser URL does
            not grant quote, acceptance, or commerce authority.
          </p>
          <div className="share-member-row">
            <span>CJ</span>
            <div>
              <strong>Challenge Judge</strong>
              <small>Buyer · Provider · Agent evaluation</small>
            </div>
            <b>Member</b>
          </div>
          <div className="share-member-row">
            <span>AA</span>
            <div>
              <strong>Attune agent</strong>
              <small>Contextual WebMCP principal</small>
            </div>
            <b>Agent</b>
          </div>
        </div>
        <footer>
          <button type="button" className="primary-action" onClick={onClose}>
            Done
          </button>
        </footer>
      </dialog>
    </div>
  );
}

function ResetDialog({
  applying,
  onClose,
  onReset,
}: {
  readonly applying: boolean;
  readonly onClose: () => void;
  readonly onReset: () => void;
}) {
  return (
    <div className="workspace-modal-backdrop" role="presentation" onPointerDown={onClose}>
      <dialog
        open
        className="workspace-modal reset-dialog"
        aria-labelledby="reset-dialog-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Judge scenario</span>
            <h2 id="reset-dialog-title">Reset AT-1042?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close reset dialog">
            ×
          </button>
        </header>
        <div className="share-dialog-body">
          <p>
            Restore the deterministic r6 clearance conflict and remove scenario receipts, quotes,
            acceptances, and commerce records. The project and workspace remain in Neon.
          </p>
          <div className="reset-target">
            <strong>Initial condition</strong>
            <span>8.1 mm observed · 12 mm required · 4/4 mounts locked</span>
          </div>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="danger-action" disabled={applying} onClick={onReset}>
            {applying ? 'Resetting…' : 'Reset deterministic scenario'}
          </button>
        </footer>
      </dialog>
    </div>
  );
}

function WorkspaceHeader({
  view,
  collaboration,
  webMcpStatus,
  onAgent,
  onShare,
  onReset,
}: {
  readonly view: AttuneApiView;
  readonly collaboration: boolean;
  readonly webMcpStatus: AttuneWebMcpStatus;
  readonly onAgent: () => void;
  readonly onShare: () => void;
  readonly onReset: () => void;
}) {
  return (
    <header className="editor-topbar">
      <div className="editor-nav-group">
        <Link href="/dashboard" className="back-to-library" aria-label="Back to dashboard">
          ←
        </Link>
        <Link href="/" className="editor-brand" aria-label="Attune home">
          <ProjectMark />
        </Link>
        <div className="editor-document-identity">
          <span>{view.product.projectName}</span>
          <strong>{view.workspace.commitmentId} · Equipment panel</strong>
        </div>
      </div>
      <div className="editor-state-group">
        <span className="revision-pill">Draft r{view.workspace.draftVersion}</span>
        <span
          className={
            view.validation.valid ? 'buildability-pill is-valid' : 'buildability-pill is-conflict'
          }
        >
          <i /> {view.validation.valid ? 'Buildable' : '1 hard conflict'}
        </span>
      </div>
      <div className="editor-actions-group">
        {collaboration ? (
          <CollaborationHeader />
        ) : (
          <span className="sync-state">
            <i /> Local view
          </span>
        )}
        <button
          type="button"
          className={
            webMcpStatus.registration === 'registered'
              ? 'agent-state-button is-connected'
              : 'agent-state-button'
          }
          onClick={onAgent}
        >
          <i />
          <span>Agent</span>
          <strong>
            {webMcpStatus.registration === 'registered' ? 'Connected' : webMcpStatus.registration}
          </strong>
        </button>
        <button type="button" className="topbar-secondary" onClick={onReset}>
          Reset scenario
        </button>
        <button type="button" className="share-button" onClick={onShare}>
          Share
        </button>
      </div>
    </header>
  );
}

function WorkspaceShell({
  workspaceId,
  collaboration,
}: {
  readonly workspaceId: string;
  readonly collaboration: boolean;
}) {
  const [view, setView] = useState<AttuneApiView | null>(null);
  const [state, setState] = useState<ProductState>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState('slot:connector');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('constraints');
  const [dockTab, setDockTab] = useState<DockTab | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [webMcpStatus, setWebMcpStatus] = useState<AttuneWebMcpStatus>(initialWebMcpStatus);

  const refresh = useCallback(async () => {
    try {
      setView(await requestAttuneView(attuneWorkspaceEndpoint('/api/attune/human', workspaceId)));
      setState('ready');
    } catch {
      setState('failed');
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
    const reload = () => void refresh();
    window.addEventListener('attune:workspace-changed', reload);
    return () => window.removeEventListener('attune:workspace-changed', reload);
  }, [refresh]);

  const execute = useCallback(
    async (path: string, command: Readonly<Record<string, unknown>>, prefix: string) => {
      if (!view) return;
      setState('applying');
      setMessage(null);
      try {
        const next = await requestAttuneView(attuneWorkspaceEndpoint(path, workspaceId), {
          method: 'POST',
          body: commandRequestBody(view, command, prefix),
        });
        setView(next);
        setState('ready');
        setCompareOpen(false);
        window.dispatchEvent(new Event('attune:workspace-changed'));
      } catch (error) {
        setMessage(
          error instanceof AttuneHttpError
            ? `${error.code}: ${error.message}`
            : 'The authoritative command failed.',
        );
        setState('failed');
        await refresh();
      }
    },
    [refresh, view, workspaceId],
  );

  const reset = useCallback(async () => {
    setState('applying');
    setMessage(null);
    try {
      const next = await requestAttuneView('/api/attune/reset', { method: 'POST', body: '{}' });
      setView(next);
      setSelectedEntity('slot:connector');
      setInspectorTab('constraints');
      setDockTab(null);
      setCompareOpen(false);
      setResetOpen(false);
      setState('ready');
      window.dispatchEvent(new Event('attune:workspace-changed'));
    } catch (error) {
      setMessage(
        error instanceof AttuneHttpError ? `${error.code}: ${error.message}` : 'Reset failed.',
      );
      setResetOpen(false);
      setState('failed');
      await refresh();
    }
  }, [refresh]);

  if (!view) {
    return (
      <main className="workspace-loading">
        {state === 'failed' ? 'Workspace unavailable' : 'Loading authoritative workspace…'}
      </main>
    );
  }

  const nextAction = workflowAction(view);
  const executeWorkflow = (action: WorkflowAction) =>
    void execute(action.path, action.command, action.prefix);
  const selectEntity = (entityId: string, tab?: InspectorTab) => {
    setSelectedEntity(entityId);
    if (tab) setInspectorTab(tab);
    setRightCollapsed(false);
  };
  const compare = () => {
    setSelectedEntity('slot:connector');
    setInspectorTab('constraints');
    setCompareOpen(true);
    setRightCollapsed(false);
  };
  const askAgent = () => setDockTab('agent');

  return (
    <main className="attune-workspace-shell">
      <AttuneWebMcp workspaceId={workspaceId} onStatus={setWebMcpStatus} />
      <WorkspaceHeader
        view={view}
        collaboration={collaboration}
        webMcpStatus={webMcpStatus}
        onAgent={askAgent}
        onShare={() => setShareOpen(true)}
        onReset={() => setResetOpen(true)}
      />
      <LifecycleStrip view={view} />
      {message ? <output className="workspace-toast">{message}</output> : null}
      <section
        className={[
          'workspace-editor-grid',
          leftCollapsed ? 'is-left-collapsed' : '',
          rightCollapsed ? 'is-right-collapsed' : '',
          dockTab ? 'has-open-dock' : '',
        ].join(' ')}
      >
        {leftCollapsed ? (
          <button
            type="button"
            className="collapsed-rail-trigger is-left"
            onClick={() => setLeftCollapsed(false)}
          >
            Items <span>›</span>
          </button>
        ) : (
          <ItemsPanel
            view={view}
            selectedEntity={selectedEntity}
            onSelect={selectEntity}
            onCollapse={() => setLeftCollapsed(true)}
          />
        )}
        <WorkspaceCanvas
          view={view}
          selectedEntity={selectedEntity}
          onSelect={(entityId) =>
            selectEntity(entityId, entityId === 'slot:connector' ? 'constraints' : 'design')
          }
          onCompare={compare}
          onAskAgent={askAgent}
          collaboration={collaboration}
        />
        {rightCollapsed ? (
          <button
            type="button"
            className="collapsed-rail-trigger is-right"
            onClick={() => setRightCollapsed(false)}
          >
            ‹ <span>Inspector</span>
          </button>
        ) : (
          <InspectorPanel
            view={view}
            selectedEntity={selectedEntity}
            tab={inspectorTab}
            compareOpen={compareOpen}
            workflowAction={nextAction}
            disabled={state === 'applying'}
            onTab={setInspectorTab}
            onCollapse={() => setRightCollapsed(true)}
            onCompare={compare}
            onAskAgent={askAgent}
            onRepair={(repairId) =>
              void execute(
                '/api/attune/human',
                { type: 'apply_deterministic_repair', repairId },
                'buyer',
              )
            }
            onWorkflow={executeWorkflow}
          />
        )}
      </section>
      <BottomDock
        view={view}
        workspaceId={workspaceId}
        collaboration={collaboration}
        tab={dockTab}
        webMcpStatus={webMcpStatus}
        workflowAction={nextAction}
        disabled={state === 'applying'}
        onTab={setDockTab}
        onWorkflow={executeWorkflow}
      />
      {shareOpen ? <ShareDialog onClose={() => setShareOpen(false)} /> : null}
      {resetOpen ? (
        <ResetDialog
          applying={state === 'applying'}
          onClose={() => setResetOpen(false)}
          onReset={() => void reset()}
        />
      ) : null}
    </main>
  );
}

export function WorkspaceProduct({
  workspaceId,
  roomId,
  collaboration,
  actor,
}: {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly collaboration: boolean;
  readonly actor: { readonly id: string; readonly name: string; readonly role: CapabilityRole };
}) {
  if (!collaboration) return <WorkspaceShell workspaceId={workspaceId} collaboration={false} />;
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null, selection: [], currentTool: 'select', activeActor: actor }}
      >
        <YjsDraftBridge workspaceId={workspaceId} />
        <WorkspaceShell workspaceId={workspaceId} collaboration />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
