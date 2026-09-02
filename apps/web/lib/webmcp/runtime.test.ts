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
      },
      delegation: { status: 'required', authorityEpoch: 0 },
    });
  });
});
