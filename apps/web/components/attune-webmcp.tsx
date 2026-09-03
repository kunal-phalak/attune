'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  attuneWorkspaceEndpoint,
  isAttuneApiView,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import { createToolRuntime, type RuntimeStatus } from '../lib/webmcp/runtime';
import {
  registerAttuneTools,
  toolNamesForCapabilities,
  type WorkspaceToolSurface,
} from '../lib/webmcp/tools';
import { AppIcons } from './ui/app-icons';

export type RegistrationState = 'checking' | 'registered' | 'unsupported' | 'failed';
export type WebMcpExecutionState = RuntimeStatus['execution'];

export interface AttuneWebMcpStatus {
  readonly registration: RegistrationState;
  readonly execution: WebMcpExecutionState;
  readonly lastAction: string | null;
  readonly workspaceSeq: number | null;
  readonly draftVersion: number | null;
  readonly availableTools: readonly string[];
  readonly interventions: number;
}

export function AttuneWebMcp({
  workspaceId,
  perspective,
  surface,
  initialView,
  onStatus,
}: {
  readonly workspaceId: string;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly surface: WorkspaceToolSurface;
  readonly initialView?: AttuneApiView;
  readonly onStatus?: (status: AttuneWebMcpStatus) => void;
}) {
  const [registration, setRegistration] = useState<RegistrationState>('checking');
  const [execution, setExecution] = useState<RuntimeStatus>({
    execution: 'idle',
    lastAction: null,
  });
  const [view, setView] = useState<AttuneApiView | null>(initialView ?? null);
  const viewRef = useRef<AttuneApiView | null>(initialView ?? null);
  const perspectiveRef = useRef(perspective);
  perspectiveRef.current = perspective;
  const updateView = useCallback((next: AttuneApiView) => {
    viewRef.current = next;
    setView(next);
  }, []);
  const refresh = useCallback(async () => {
    const next = await requestAttuneView(
      attuneWorkspaceEndpoint('/api/attune/webmcp', workspaceId, { perspective }),
    );
    updateView(next);
  }, [perspective, updateView, workspaceId]);
  const availableAuthorityKey = view
    ? (view.authority?.capabilityIds ?? view.capabilities.map(({ id }) => id)).toSorted().join('|')
    : '';
  const possessedAuthorityKey = view
    ? (view.authority?.possessedCapabilityIds ?? view.authority?.capabilityIds ?? [])
        .toSorted()
        .join('|')
    : '';
  const capabilityKey = view?.delegation.status === 'active' ? availableAuthorityKey : '';
  const authorityKey = view?.delegation.status === 'active' ? possessedAuthorityKey : '';
  const capabilityIds = useMemo(
    () => new Set(capabilityKey ? capabilityKey.split('|') : []),
    [capabilityKey],
  );
  const authorityIds = useMemo(
    () => new Set(authorityKey ? authorityKey.split('|') : []),
    [authorityKey],
  );
  const checkoutAvailable =
    view?.workspace.externalCommerceRecords.some(({ invoiceUrl }) => Boolean(invoiceUrl)) ?? false;
  const judgeMode = view?.product.judgeMode === true;
  const toolScope = useMemo(
    () => ({ surface, checkoutAvailable, judgeMode }),
    [checkoutAvailable, judgeMode, surface],
  );
  const availableTools = useMemo(
    () => toolNamesForCapabilities(capabilityIds, toolScope, authorityIds),
    [authorityIds, capabilityIds, toolScope],
  );
  const workspaceReady = view !== null;
  const toolsEnabled = view?.product.agentToolsEnabled === true;

  useEffect(() => {
    void refresh().catch(() => setRegistration('failed'));
    const reload = (event: Event) => {
      if (event instanceof CustomEvent && isAttuneApiView(event.detail)) {
        updateView(event.detail);
        return;
      }
      void refresh().catch(() => setRegistration('failed'));
    };
    window.addEventListener('attune:workspace-changed', reload);
    return () => window.removeEventListener('attune:workspace-changed', reload);
  }, [refresh, updateView]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) {
      setRegistration('unsupported');
      return undefined;
    }
    if (!workspaceReady) return undefined;
    if (!toolsEnabled) {
      setRegistration('unsupported');
      return undefined;
    }
    const lifecycle = new AbortController();
    const runtime = createToolRuntime({
      workspaceId,
      perspective: () => perspectiveRef.current,
      viewRef,
      updateView,
      report: setExecution,
    });
    setRegistration('checking');
    void registerAttuneTools(
      context,
      runtime,
      capabilityIds,
      lifecycle.signal,
      toolScope,
      authorityIds,
    ).then(
      () => setRegistration('registered'),
      () => setRegistration('failed'),
    );
    return () => lifecycle.abort();
  }, [
    authorityIds,
    capabilityIds,
    toolScope,
    toolsEnabled,
    updateView,
    workspaceId,
    workspaceReady,
  ]);

  useEffect(() => {
    onStatus?.({
      registration,
      execution: execution.execution,
      lastAction: execution.lastAction,
      workspaceSeq: view?.workspace.workspaceSeq ?? null,
      draftVersion: view?.workspace.draftVersion ?? null,
      availableTools,
      interventions: view?.observation.interventions.length ?? 0,
    });
  }, [availableTools, execution, onStatus, registration, view]);

  const delegation = view?.delegation;
  const enabled = delegation?.status === 'active';
  const unsupported = registration === 'unsupported';
  const updateAgentAccess = async () => {
    const response = await fetch(
      attuneWorkspaceEndpoint('/api/attune/webmcp/delegation', workspaceId, { perspective }),
      {
        method: enabled ? 'DELETE' : 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(enabled ? {} : { body: JSON.stringify({ consent: true }) }),
      },
    );
    if (!response.ok) throw new Error('Agent access could not be updated.');
    await refresh();
  };

  return (
    <>
      <Popover>
        <Popover.Trigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<AppIcons.Agent size={18} />}
              aria-label={
                unsupported
                  ? 'WebMCP unavailable in this browser'
                  : `Agent access ${enabled ? 'on' : 'off'}`
              }
              data-active={(enabled && !unsupported) || undefined}
            >
              Agent access: {unsupported ? 'Unavailable' : enabled ? 'On' : 'Off'}
            </Button>
          }
        />
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          positionMethod="fixed"
          className="workspace-agent-popover"
        >
          <Popover.Title className="workspace-agent-popover-title">Agent access</Popover.Title>
          <p>
            {unsupported
              ? 'This browser does not expose document.modelContext, so Attune cannot register browser-agent tools here.'
              : delegation?.status === 'revalidation_required'
                ? 'Workspace authority changed. Revalidate access before the agent mutates the design.'
                : enabled
                  ? 'Short-lived browser-agent delegation is active for your current workspace authority.'
                  : 'Enable a short-lived browser-agent delegation for capabilities you already possess.'}
          </p>
          <div className="workspace-agent-popover-footer">
            {unsupported ? null : (
              <Button
                type="button"
                variant={enabled ? 'secondary' : 'primary'}
                size="sm"
                className="workspace-agent-popover-action"
                onClick={() => void updateAgentAccess()}
              >
                {enabled
                  ? 'Disable agent'
                  : delegation?.status === 'revalidation_required'
                    ? 'Revalidate agent'
                    : 'Enable agent'}
              </Button>
            )}
          </div>
        </Popover.Content>
      </Popover>
      <output className="visually-hidden" aria-live="polite">
        Contextual WebMCP {registration}. {availableTools.length} tools available. Agent delegation{' '}
        {delegation?.status ?? 'required'}.
      </output>
    </>
  );
}
