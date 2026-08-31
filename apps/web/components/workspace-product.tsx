'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Dialog } from '@cloudflare/kumo/components/dialog';
import { Tabs } from '@cloudflare/kumo/components/tabs';
import { LiveblocksProvider, RoomProvider, useRoom } from '@liveblocks/react';
import { getYjsProviderForRoom } from '@liveblocks/yjs';
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
import { AppIcons } from './ui/app-icons';
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

function ShareDialog({ onClose }: { readonly onClose: () => void }) {
  return (
    <Dialog.Root defaultOpen onOpenChange={(open) => !open && onClose()}>
      <Dialog className="z-[90]" size="lg">
        <header className="flex items-start justify-between gap-4 border-b border-kumo-line p-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle">
              Workspace access
            </span>
            <Dialog.Title id="share-dialog-title">Share AT-1042</Dialog.Title>
          </div>
          <Dialog.Close
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<AppIcons.Close size={20} weight="bold" />}
                aria-label="Close share dialog"
              />
            }
          />
        </header>
        <div className="space-y-4 p-5">
          <Dialog.Description>
            Membership and business roles are verified by the server. Sharing this browser URL does
            not grant quote, acceptance, or commerce authority.
          </Dialog.Description>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-kumo-line p-3">
            <span className="grid size-9 place-items-center rounded-full bg-kumo-brand/10 text-kumo-brand">
              <AppIcons.Person size={20} weight="fill" />
            </span>
            <div className="min-w-0">
              <strong className="block text-sm">Challenge Judge</strong>
              <small className="block text-xs text-kumo-subtle">
                Human member · Buyer and provider perspectives
              </small>
            </div>
            <b className="text-xs">Member</b>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-kumo-line p-3">
            <span className="grid size-9 place-items-center rounded-full bg-attune-agent/10 text-attune-agent">
              <AppIcons.Agent size={20} weight="fill" />
            </span>
            <div className="min-w-0">
              <strong className="block text-sm">Buyer or provider agent</strong>
              <small className="block text-xs text-kumo-subtle">
                Role-scoped server delegation · Native WebMCP
              </small>
            </div>
            <b className="text-xs">Agent</b>
          </div>
        </div>
        <footer className="flex justify-end border-t border-kumo-line p-4">
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
      <Dialog className="z-[90]" size="lg">
        <header className="flex items-start justify-between gap-4 border-b border-kumo-line p-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-kumo-subtle">
              Judge scenario
            </span>
            <Dialog.Title id="reset-dialog-title">Reset AT-1042?</Dialog.Title>
          </div>
          <Dialog.Close
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                icon={<AppIcons.Close size={20} weight="bold" />}
                aria-label="Close reset dialog"
              />
            }
          />
        </header>
        <div className="space-y-4 p-5">
          <Dialog.Description>
            Restore the deterministic r6 clearance conflict and remove scenario receipts, quotes,
            acceptances, and commerce records. The project and workspace remain in Neon.
          </Dialog.Description>
          <div className="rounded-lg border border-attune-conflict/25 bg-attune-conflict/5 p-3">
            <strong className="block text-sm">Initial condition</strong>
            <span className="mt-1 block text-xs text-kumo-subtle">
              8.1 mm observed · 12 mm required · 4/4 mounts locked
            </span>
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-kumo-line p-4">
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
        <span className="inline-flex items-center gap-1.5">
          <AppIcons.Person size={16} weight="bold" /> Judge Buyer
        </span>
      ),
    },
    {
      value: 'provider',
      label: (
        <span className="inline-flex items-center gap-1.5">
          <AppIcons.Person size={16} weight="bold" /> Judge Provider
        </span>
      ),
    },
  ];
  return (
    <header
      className={`absolute top-2 right-2 left-2 z-50 grid h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 shadow-md backdrop-blur md:grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)] md:px-4 ${view.perspective === 'provider' ? 'border-amber-300 bg-amber-50/95' : 'border-kumo-line bg-kumo-base/95'}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/dashboard"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-kumo-subtle no-underline hover:bg-kumo-fill-hover hover:text-kumo-contrast"
          aria-label="Back to dashboard"
        >
          <AppIcons.Back size={20} weight="bold" />
        </Link>
        <Link
          href="/"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-kumo-contrast text-kumo-base no-underline"
          aria-label="Attune home"
        >
          <AppIcons.Brand size={20} weight="bold" />
        </Link>
        <div className="min-w-0">
          <span className="block truncate text-[11px] text-kumo-subtle">
            {view.product.projectName}
          </span>
          <strong className="block truncate text-sm font-semibold">
            {view.workspace.commitmentId} · Control-enclosure faceplate
          </strong>
        </div>
      </div>
      <div className="hidden items-center justify-center gap-2 md:flex">
        {judgeMode ? (
          <div
            className="flex flex-col items-center gap-0.5"
            aria-label="Judge workspace perspective"
          >
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
            <small className="text-[10px] text-kumo-subtle">
              {view.perspective === 'buyer'
                ? 'Buyer authority · private design'
                : 'Provider authority · Shopify mirror enabled'}
            </small>
          </div>
        ) : (
          <span className="rounded-full border border-kumo-line bg-kumo-recessed px-2.5 py-1 text-xs font-semibold capitalize">
            {view.perspective} workspace
          </span>
        )}
        <span className="rounded-full border border-kumo-line bg-kumo-base px-2.5 py-1 text-xs font-semibold">
          Draft r{view.workspace.draftVersion}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${view.validation.valid ? 'border-attune-valid/30 bg-attune-valid/10 text-attune-valid' : 'border-attune-conflict/30 bg-attune-conflict/10 text-attune-conflict'}`}
        >
          <i className="size-1.5 rounded-full bg-current" />{' '}
          {view.validation.valid ? 'Buildable' : '1 hard conflict'}
        </span>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        {collaboration ? (
          <CollaborationHeader />
        ) : (
          <span className="hidden items-center gap-1.5 text-xs text-kumo-subtle lg:inline-flex">
            <i className="size-1.5 rounded-full bg-kumo-contrast/30" /> Local view
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<AppIcons.Agent size={20} weight="fill" />}
          className="hidden lg:inline-flex"
          onClick={onAgent}
        >
          <span>Agent</span>
          <strong
            className={
              webMcpStatus.registration === 'registered' ? 'text-attune-valid' : 'text-kumo-subtle'
            }
          >
            {webMcpStatus.registration === 'registered' ? 'Connected' : webMcpStatus.registration}
          </strong>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden xl:inline-flex"
          icon={<AppIcons.Reset size={16} weight="bold" />}
          onClick={onReset}
        >
          Reset scenario
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          icon={<AppIcons.Share size={16} weight="bold" />}
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
      <main className="grid min-h-dvh place-items-center bg-kumo-canvas text-sm text-kumo-subtle">
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
    <main
      className="group/workspace relative h-dvh min-h-[560px] min-w-0 overflow-hidden bg-kumo-canvas"
      data-left-collapsed={leftCollapsed}
      data-perspective={view.perspective}
      data-right-collapsed={rightCollapsed}
    >
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
      <section
        className="absolute top-[132px] right-3 left-3 z-30 rounded-lg border border-kumo-line bg-kumo-base/95 px-4 py-2 text-xs shadow-sm backdrop-blur md:hidden"
        aria-label="Mobile editing notice"
      >
        <strong className="block">Review mode on this screen</strong>
        <span className="mt-0.5 block text-kumo-subtle">
          Comments, history, capability and order status remain available. Use a larger screen for
          complex geometry editing.
        </span>
      </section>
      {leftCollapsed ? (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          icon={<AppIcons.CollapseRight size={16} weight="bold" />}
          className="absolute top-[132px] left-3 z-40 hidden shadow-sm lg:inline-flex"
          onClick={() => setLeftCollapsed(false)}
        >
          Items
        </Button>
      ) : (
        <ItemsPanel
          view={view}
          selectedEntity={selectedEntity}
          onSelect={selectEntity}
          onCollapse={() => setLeftCollapsed(true)}
        />
      )}
      {rightCollapsed ? (
        <Button
          type="button"
          variant="secondary"
          size="xs"
          icon={<AppIcons.CollapseLeft size={16} weight="bold" />}
          className="absolute top-[132px] right-3 z-40 hidden shadow-sm lg:inline-flex"
          onClick={() => setRightCollapsed(false)}
        >
          Inspector
        </Button>
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
