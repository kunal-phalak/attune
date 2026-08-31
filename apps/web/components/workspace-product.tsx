'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Tabs } from '@cloudflare/kumo/components/tabs';
import { LiveblocksProvider, RoomProvider, useRoom } from '@liveblocks/react';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  Robot,
  ShareNetwork,
  UserCircle,
  X,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { attuneToastManager } from './attune-ui-provider';
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

function transitionNotice(command: Readonly<Record<string, unknown>>, view: AttuneApiView) {
  const type = typeof command.type === 'string' ? command.type : 'command';
  const notices: Readonly<Record<string, { title: string; description: string }>> = {
    accept_revision: {
      title: 'Exact revision accepted',
      description: `Buyer acceptance now binds draft r${view.workspace.draftVersion} and its provider profile.`,
    },
    apply_deterministic_repair: {
      title: 'Design is buildable',
      description: 'Provider clearance now passes. All four protected mounts remain unchanged.',
    },
    freeze_and_quote_revision: {
      title: 'Provider quote recorded',
      description: `Draft r${view.workspace.draftVersion} is frozen and quoted as one fabrication lot.`,
    },
    materialize_for_commerce: {
      title: 'Shopify verification passed',
      description: 'The external commerce identity matches the exact accepted specification.',
    },
    move_slot: {
      title: 'New draft revision created',
      description:
        'Prior accepted commerce authority does not carry into the changed specification.',
    },
    request_quote: {
      title: 'Provider review requested',
      description: 'The private request is bound to this exact specification and provider profile.',
    },
  };
  return (
    notices[type] ?? { title: 'Specification updated', description: 'Authoritative state saved.' }
  );
}

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
    const onChange = () => void synchronize();
    window.addEventListener('attune:workspace-changed', onChange);
    return () => {
      active = false;
      window.removeEventListener('attune:workspace-changed', onChange);
    };
  }, [perspective, provider, workspaceId]);

  return null;
}

function workflowAction(view: AttuneApiView): WorkflowAction | null {
  const quote = view.workspace.quotes.find(
    (candidate) =>
      candidate.revisionId === `r${view.workspace.draftVersion}` &&
      candidate.specHash === view.specHash,
  );
  if (view.perspective === 'buyer' && available(view, 'buyer', 'request_quote'))
    return {
      label: 'Request exact quote',
      path: '/api/attune/human',
      prefix: 'buyer',
      command: { type: 'request_quote' },
    };
  if (view.perspective === 'provider' && available(view, 'provider', 'freeze_and_quote_revision'))
    return {
      label: `Freeze + quote exact r${view.workspace.draftVersion}`,
      path: '/api/attune/provider',
      prefix: 'provider',
      command: { type: 'freeze_and_quote_revision' },
    };
  if (view.perspective === 'buyer' && available(view, 'buyer', 'accept_revision') && quote)
    return {
      label: `Accept exact ${quote.revisionId}`,
      path: '/api/attune/human',
      prefix: 'buyer',
      command: { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
    };
  if (view.perspective === 'provider' && available(view, 'provider', 'materialize_for_commerce'))
    return {
      label: 'Materialize + verify Shopify',
      path: '/api/attune/webmcp',
      prefix: 'agent',
      command: { type: 'materialize_for_commerce', revisionId: `r${view.workspace.draftVersion}` },
    };
  if (
    view.perspective === 'buyer' &&
    available(view, 'buyer', 'navigate_to_storefront') &&
    view.workspace.draftVersion === 7
  )
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
    <Dialog.Root defaultOpen onOpenChange={(open) => !open && onClose()}>
      <Dialog className="workspace-modal" size="lg">
        <header>
          <div>
            <span>Workspace access</span>
            <Dialog.Title id="share-dialog-title">Share AT-1042</Dialog.Title>
          </div>
          <Dialog.Close
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<X size={20} weight="bold" />}
                aria-label="Close share dialog"
              />
            }
          />
        </header>
        <div className="share-dialog-body">
          <Dialog.Description>
            Membership and business roles are verified by the server. Sharing this browser URL does
            not grant quote, acceptance, or commerce authority.
          </Dialog.Description>
          <div className="share-member-row">
            <span className="is-human">
              <UserCircle size={20} weight="fill" />
            </span>
            <div>
              <strong>Challenge Judge</strong>
              <small>Human member · Buyer and provider perspectives</small>
            </div>
            <b>Member</b>
          </div>
          <div className="share-member-row">
            <span className="is-agent">
              <Robot size={20} weight="fill" />
            </span>
            <div>
              <strong>Buyer or provider agent</strong>
              <small>Role-scoped server delegation · Native WebMCP</small>
            </div>
            <b>Agent</b>
          </div>
        </div>
        <footer>
          <Dialog.Close render={<Button variant="primary">Done</Button>} />
        </footer>
      </Dialog>
    </Dialog.Root>
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
    <Dialog.Root role="alertdialog" defaultOpen onOpenChange={(open) => !open && onClose()}>
      <Dialog className="workspace-modal reset-dialog" size="lg">
        <header>
          <div>
            <span>Judge scenario</span>
            <Dialog.Title id="reset-dialog-title">Reset AT-1042?</Dialog.Title>
          </div>
          <Dialog.Close
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<X size={20} weight="bold" />}
                aria-label="Close reset dialog"
              />
            }
          />
        </header>
        <div className="share-dialog-body">
          <Dialog.Description>
            Restore the deterministic r6 clearance conflict and remove scenario receipts, quotes,
            acceptances, and commerce records. The project and workspace remain in Neon.
          </Dialog.Description>
          <div className="reset-target">
            <strong>Initial condition</strong>
            <span>8.1 mm observed · 12 mm required · 4/4 mounts locked</span>
          </div>
        </div>
        <footer>
          <Dialog.Close render={<Button variant="secondary">Cancel</Button>} />
          <Button variant="destructive" disabled={applying} onClick={onReset}>
            {applying ? 'Resetting…' : 'Reset deterministic scenario'}
          </Button>
        </footer>
      </Dialog>
    </Dialog.Root>
  );
}

function WorkspaceHeader({
  view,
  judgeMode,
  collaboration,
  webMcpStatus,
  onAgent,
  onShare,
  onReset,
}: {
  readonly view: AttuneApiView;
  readonly judgeMode: boolean;
  readonly collaboration: boolean;
  readonly webMcpStatus: AttuneWebMcpStatus;
  readonly onAgent: () => void;
  readonly onShare: () => void;
  readonly onReset: () => void;
}) {
  const router = useRouter();
  const perspectiveTabs = [
    {
      value: 'buyer',
      label: (
        <span className="perspective-tab-label">
          <UserCircle size={16} weight="bold" /> Judge Buyer
        </span>
      ),
    },
    {
      value: 'provider',
      label: (
        <span className="perspective-tab-label">
          <UserCircle size={16} weight="bold" /> Judge Provider
        </span>
      ),
    },
  ];
  return (
    <header className={`editor-topbar is-${view.perspective}`}>
      <div className="editor-nav-group">
        <Link href="/dashboard" className="back-to-library" aria-label="Back to dashboard">
          <ArrowLeft size={20} weight="bold" />
        </Link>
        <Link href="/" className="editor-brand" aria-label="Attune home">
          <ProjectMark />
        </Link>
        <div className="editor-document-identity">
          <span>{view.product.projectName}</span>
          <strong>{view.workspace.commitmentId} · Control-enclosure faceplate</strong>
        </div>
      </div>
      <div className="editor-state-group">
        {judgeMode ? (
          <div className="perspective-switcher" aria-label="Judge workspace perspective">
            <Tabs
              size="sm"
              value={view.perspective}
              tabs={perspectiveTabs}
              onValueChange={(next) =>
                router.push(
                  `/workspace/${encodeURIComponent(view.product.workspaceId)}?perspective=${next}`,
                )
              }
            />
            <small>
              {view.perspective === 'buyer'
                ? 'Buyer authority · private design'
                : 'Provider authority · Shopify mirror enabled'}
            </small>
          </div>
        ) : (
          <span className={`perspective-badge is-${view.perspective}`}>
            {view.perspective} workspace
          </span>
        )}
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Robot size={20} weight="fill" />}
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
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="topbar-secondary"
          icon={<ArrowCounterClockwise size={16} weight="bold" />}
          onClick={onReset}
        >
          Reset scenario
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="share-button"
          icon={<ShareNetwork size={16} weight="bold" />}
          onClick={onShare}
        >
          Share
        </Button>
      </div>
    </header>
  );
}

function WorkspaceShell({
  workspaceId,
  collaboration,
  perspective,
  judgeMode,
}: {
  readonly workspaceId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly judgeMode: boolean;
}) {
  const [view, setView] = useState<AttuneApiView | null>(null);
  const [state, setState] = useState<ProductState>('loading');
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
      const path = perspective === 'provider' ? '/api/attune/provider' : '/api/attune/human';
      setView(await requestAttuneView(attuneWorkspaceEndpoint(path, workspaceId)));
      setState('ready');
    } catch {
      setState('failed');
    }
  }, [perspective, workspaceId]);

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
      try {
        const next = await requestAttuneView(attuneWorkspaceEndpoint(path, workspaceId), {
          method: 'POST',
          body: commandRequestBody(view, command, prefix),
        });
        setView(next);
        setState('ready');
        setCompareOpen(false);
        const notice = transitionNotice(command, next);
        attuneToastManager.add({ ...notice, variant: 'success' });
        window.dispatchEvent(new Event('attune:workspace-changed'));
      } catch (error) {
        attuneToastManager.add({
          title: 'Action not applied',
          description:
            error instanceof AttuneHttpError
              ? error.message
              : 'Attune could not revalidate the authoritative workspace.',
          variant: 'error',
        });
        setState('failed');
        await refresh();
      }
    },
    [refresh, view, workspaceId],
  );

  const reset = useCallback(async () => {
    setState('applying');
    try {
      const next = await requestAttuneView('/api/attune/reset', { method: 'POST', body: '{}' });
      setView(next);
      setSelectedEntity('slot:connector');
      setInspectorTab('constraints');
      setDockTab(null);
      setCompareOpen(false);
      setResetOpen(false);
      setState('ready');
      attuneToastManager.add({
        title: 'Judge scenario restored',
        description: 'Draft r6 again has the 8.1 mm provider-clearance conflict.',
        variant: 'info',
      });
      window.dispatchEvent(new Event('attune:workspace-changed'));
    } catch (error) {
      attuneToastManager.add({
        title: 'Scenario reset failed',
        description:
          error instanceof AttuneHttpError ? error.message : 'The authoritative reset failed.',
        variant: 'error',
      });
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
    <main className="attune-workspace-shell" data-perspective={view.perspective}>
      <AttuneWebMcp
        workspaceId={workspaceId}
        perspective={perspective}
        onStatus={setWebMcpStatus}
      />
      <WorkspaceHeader
        view={view}
        judgeMode={judgeMode}
        collaboration={collaboration}
        webMcpStatus={webMcpStatus}
        onAgent={askAgent}
        onShare={() => setShareOpen(true)}
        onReset={() => setResetOpen(true)}
      />
      <LifecycleStrip view={view} />
      <section className="mobile-editing-notice" aria-label="Mobile editing notice">
        <strong>Review mode on this screen</strong>
        <span>
          Comments, history, capability and order status remain available. Use a larger screen for
          complex geometry editing.
        </span>
      </section>
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
          commentsMode={dockTab === 'comments'}
          revisionContext={{
            revisionId: `draft:r${view.workspace.draftVersion}`,
            specHash: view.specHash,
          }}
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
        selectedEntity={selectedEntity}
        onSelectEntity={(entityId) => selectEntity(entityId, 'design')}
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
  perspective,
  judgeMode,
  actor,
}: {
  readonly workspaceId: string;
  readonly roomId: string;
  readonly collaboration: boolean;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly judgeMode: boolean;
  readonly actor: { readonly id: string; readonly name: string; readonly role: CapabilityRole };
}) {
  if (!collaboration)
    return (
      <WorkspaceShell
        workspaceId={workspaceId}
        collaboration={false}
        perspective={perspective}
        judgeMode={judgeMode}
      />
    );
  return (
    <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
      <RoomProvider
        id={roomId}
        initialPresence={{ cursor: null, selection: [], currentTool: 'select', activeActor: actor }}
      >
        <YjsDraftBridge workspaceId={workspaceId} perspective={perspective} />
        <WorkspaceShell
          workspaceId={workspaceId}
          collaboration
          perspective={perspective}
          judgeMode={judgeMode}
        />
      </RoomProvider>
    </LiveblocksProvider>
  );
}
