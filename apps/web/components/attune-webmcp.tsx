'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  attuneWorkspaceEndpoint,
  requestAttuneView,
  type AttuneApiView,
  type CapabilityRole,
} from '../lib/attune-view';
import { createToolRuntime, type RuntimeStatus } from '../lib/webmcp/runtime';
import { registerAttuneTools, toolNamesForCapabilities } from '../lib/webmcp/tools';

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
  onStatus,
}: {
  readonly workspaceId: string;
  readonly perspective: Extract<CapabilityRole, 'buyer' | 'provider'>;
  readonly onStatus?: (status: AttuneWebMcpStatus) => void;
}) {
  const [registration, setRegistration] = useState<RegistrationState>('checking');
  const [execution, setExecution] = useState<RuntimeStatus>({
    execution: 'idle',
    lastAction: null,
  });
  const [view, setView] = useState<AttuneApiView | null>(null);
  const viewRef = useRef<AttuneApiView | null>(null);
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
  const capabilityKey =
    view?.capabilities
      .map(({ id }) => id)
      .toSorted()
      .join('|') ?? '';
  const capabilityIds = useMemo(
    () => new Set(capabilityKey ? capabilityKey.split('|') : []),
    [capabilityKey],
  );
  const availableTools = useMemo(() => toolNamesForCapabilities(capabilityIds), [capabilityIds]);
  const workspaceReady = view !== null;

  useEffect(() => {
    void refresh().catch(() => setRegistration('failed'));
    const reload = () => void refresh().catch(() => setRegistration('failed'));
    window.addEventListener('attune:workspace-changed', reload);
    return () => window.removeEventListener('attune:workspace-changed', reload);
  }, [refresh]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) {
      setRegistration('unsupported');
      return undefined;
    }
    if (!workspaceReady) return undefined;
    const lifecycle = new AbortController();
    const runtime = createToolRuntime({
      workspaceId,
      perspective,
      viewRef,
      updateView,
      report: setExecution,
    });
    setRegistration('checking');
    void registerAttuneTools(context, runtime, capabilityIds, lifecycle.signal).then(
      () => setRegistration('registered'),
      () => setRegistration('failed'),
    );
    return () => lifecycle.abort();
  }, [capabilityIds, perspective, updateView, workspaceId, workspaceReady]);

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

  return (
    <output className="visually-hidden" aria-live="polite">
      Contextual WebMCP {registration}. {availableTools.length} tools available.
    </output>
  );
}
