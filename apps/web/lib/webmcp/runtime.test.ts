import { createAt1042Workspace, hashSpecification } from '@attune/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAttuneApiView, type AttuneApiView } from '../attune-view';
import { createToolRuntime } from './runtime';

function bootstrapView(): AttuneApiView {
  const workspace = createAt1042Workspace();
  const candidate: unknown = {
    workspace,
    specHash: hashSpecification(workspace),
    capabilities: [{ id: 'edit_draft', available: true }],
    authority: {
      perspectives: ['buyer'],
      capabilityIds: ['edit_draft'],
      authorityEpoch: workspace.authorityEpoch,
    },
    delegation: {
      status: 'active',
      authorityEpoch: workspace.authorityEpoch,
      expiresAt: '2026-09-03T12:00:00.000Z',
    },
    observation: { interventions: [] },
    semantic: { documentRevision: workspace.sketchDocument.revision },
  };
  if (!isAttuneApiView(candidate)) throw new TypeError('Invalid test bootstrap view.');
  return candidate;
}

function mutationResult() {
  return {
    status: 'APPLIED',
    receipt: { id: 'receipt:1:webmcp-once', command: 'edit_geometry', origin: 'webmcp' },
    workspaceSequence: 1,
    draftVersion: 7,
    capabilityEpoch: 2,
    authorityEpoch: 0,
    specificationHash: 'b'.repeat(64),
    changedEntities: ['sketch:hub:bore'],
    availableCapabilities: ['edit_draft'],
    solver: {
      status: 'success',
      conflicts: [],
      diagnostics: [],
      degreesOfFreedomBefore: null,
      degreesOfFreedomAfter: 41,
    },
    rebase: { fromWorkspaceSequence: null, unseenHumanChanges: [] },
    delegation: {
      status: 'active',
      authorityEpoch: 0,
      expiresAt: '2026-09-03T12:10:00.000Z',
    },
    next: {
      revision: 1,
      workspaceSequence: 1,
      specificationHash: 'b'.repeat(64),
      solver: {
        status: 'success',
        degreesOfFreedom: 41,
        conflicts: [],
        redundant: [],
      },
      candidates: [],
      availableActions: [
        'inspect_context',
        'modify_geometry',
        'constrain_geometry',
        'forecast_change',
        'check_design',
      ],
    },
  } as const;
}

afterEach(() => vi.unstubAllGlobals());

describe('one-request WebMCP semantic mutation runtime', () => {
  it('commits in one authoritative HTTP round trip and returns reusable next context', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(mutationResult(), { headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const viewRef = { current: bootstrapView() };
    const runtime = createToolRuntime({
      workspaceId: 'workspace:at-1042',
      perspective: 'buyer',
      viewRef,
      updateView: (view) => {
        viewRef.current = view;
      },
      report: () => undefined,
    });

    const result = await runtime.execute({
      type: 'edit_geometry',
      entities: [
        {
          id: 'sketch:hub:bore',
          kind: 'circle',
          center: { x: 0, y: 0 },
          radius: 18,
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(result).toEqual(
      expect.objectContaining({
        status: 'APPLIED',
        changedEntities: ['sketch:hub:bore'],
        next: expect.objectContaining({
          workspaceSequence: 1,
          specificationHash: 'b'.repeat(64),
          availableActions: expect.arrayContaining(['modify_geometry', 'constrain_geometry']),
        }),
      }),
    );
  });

  it('derives Maker perspective from destination and acknowledges initiated navigation', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(bootstrapView()),
    );
    const assign = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      location: { search: '?surface=marketplace', assign },
    });
    const viewRef = { current: bootstrapView() };
    const reports: string[] = [];
    const runtime = createToolRuntime({
      workspaceId: 'workspace:at-1042',
      perspective: 'buyer',
      viewRef,
      updateView: () => undefined,
      report: ({ execution }) => reports.push(execution),
    });

    await expect(runtime.navigate?.('maker_requests')).resolves.toEqual({
      status: 'NAVIGATION_INITIATED',
      fromSurface: 'find_makers',
      toSurface: 'maker_requests',
      perspective: 'provider',
      authorityUnchanged: true,
    });
    const requestTarget = fetchMock.mock.calls[0]?.[0];
    const requestedUrl =
      requestTarget instanceof URL
        ? requestTarget.href
        : typeof requestTarget === 'string'
          ? requestTarget
          : requestTarget?.url;
    expect(requestedUrl).toContain('perspective=provider');
    expect(assign).toHaveBeenCalledWith(
      '/workspace/workspace%3Aat-1042?perspective=provider&surface=provider_requests',
    );
    expect(reports).toEqual(['executing', 'completed']);
  });

  it('cancels pending navigation before any visible destination change', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { search: '', assign } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const viewRef = { current: bootstrapView() };
    const runtime = createToolRuntime({
      workspaceId: 'workspace:at-1042',
      perspective: 'buyer',
      viewRef,
      updateView: () => undefined,
      report: () => undefined,
    });
    const cancellation = new AbortController();
    const pending = runtime.navigate?.('maker_requests', cancellation.signal);
    cancellation.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(assign).not.toHaveBeenCalled();
  });

  it('returns a structured delegation error instead of throwing a generic failure', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: 'DELEGATION_REQUIRED',
            message: 'Enable agent access for this workspace.',
            changedEntities: [],
          },
        },
        { status: 403 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const viewRef = { current: bootstrapView() };
    viewRef.current = {
      ...viewRef.current,
      delegation: { status: 'required', authorityEpoch: 0 },
    };
    const runtime = createToolRuntime({
      workspaceId: 'workspace:at-1042',
      perspective: 'buyer',
      viewRef,
      updateView: () => undefined,
      report: () => undefined,
    });

    await expect(runtime.execute({ type: 'edit_geometry', entities: [] })).resolves.toEqual({
      status: 'DELEGATION_REQUIRED',
      error: {
        code: 'DELEGATION_REQUIRED',
        message: 'Enable agent access for this workspace.',
        semanticRefs: [],
        latestVersions: {},
        whatChanged: 'Enable agent access for this workspace.',
        canRetry: false,
      },
      delegation: { status: 'required', authorityEpoch: 0 },
    });
  });

  it('refreshes and retries one safe stale observation exactly once', async () => {
    const initial = bootstrapView();
    const target = initial.workspace.sketchDocument.entities.find(({ kind }) => kind === 'circle')!;
    const refreshed: AttuneApiView = {
      ...initial,
      specHash: 'c'.repeat(64),
      workspace: {
        ...initial.workspace,
        workspaceSeq: 2,
        sketchDocument: {
          ...initial.workspace.sketchDocument,
          entities: initial.workspace.sketchDocument.entities.map((entity) =>
            entity.id === target.id ? { ...entity, version: 7 } : entity,
          ),
        },
      },
    };
    let calls = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        return Response.json(
          {
            error: {
              code: 'CONTEXT_CHANGED',
              message: 'The observation snapshot expired.',
              changedEntities: ['sketch:document'],
              latestVersions: { 'sketch:document': 0 },
              canRetry: true,
            },
          },
          { status: 409 },
        );
      }
      if (calls === 2) return Response.json(refreshed);
      return Response.json(mutationResult(), {
        headers: { 'Server-Timing': 'recipe_instantiation;dur=2.4, plane_gcs;dur=3.1' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const viewRef = { current: initial };
    const runtime = createToolRuntime({
      workspaceId: 'workspace:at-1042',
      perspective: 'buyer',
      viewRef,
      updateView: (view) => {
        viewRef.current = view;
      },
      report: () => undefined,
    });

    const result = await runtime.execute({
      type: 'set_radius',
      target: { entityId: target.id, expectedVersion: target.version },
      radius: 12,
    });
    const retryRequestBody = fetchMock.mock.calls[2]?.[1]?.body;
    if (typeof retryRequestBody !== 'string') throw new TypeError('Missing retry request body.');
    const retryBody = JSON.parse(retryRequestBody);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(retryBody.command.target).toEqual({ entityId: target.id, expectedVersion: 7 });
    expect(result).toEqual(
      expect.objectContaining({
        status: 'APPLIED',
        timings: expect.objectContaining({
          automatic_retries: 1,
          recipe_instantiation: 2.4,
          plane_gcs: 3.1,
        }),
      }),
    );
  });
});
