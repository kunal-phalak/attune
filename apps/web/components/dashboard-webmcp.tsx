'use client';

import { Button } from '@cloudflare/kumo/components/button';
import { Popover } from '@cloudflare/kumo/components/popover';
import { useEffect, useMemo, useState } from 'react';

import { isAttuneApiView } from '../lib/attune-view';
import { judgeReviewFlow, type JudgeReviewFlow } from '../lib/judge-review-flow';
import { AppIcons } from './ui/app-icons';

export interface DashboardAgentProject {
  readonly workspaceId: string;
  readonly projectName: string;
  readonly updatedAt: string;
  readonly draftVersion: number;
  readonly roles: readonly string[];
  readonly request: {
    readonly requestId: string;
    readonly status: string;
    readonly versionNumber: number;
    readonly updatedAt: string;
  } | null;
  readonly quote: {
    readonly quoteId: string;
    readonly status: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly leadTimeDays?: number;
  } | null;
  readonly accepted: boolean;
  readonly draftOrder: {
    readonly name?: string;
    readonly status: string;
    readonly updatedAt: string;
    readonly checkoutAvailable: boolean;
  } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}

function exact(value: Record<string, unknown>, keys: readonly string[], name: string) {
  const unsupported = Object.keys(value).filter((key) => !keys.includes(key));
  if (unsupported.length) throw new TypeError(`${name} contains unsupported fields.`);
}

function projectStage(project: DashboardAgentProject): string {
  if (project.draftOrder) return 'SHOPIFY_DRAFT_ORDER';
  if (project.accepted) return 'ACCEPTED';
  if (project.quote) return 'QUOTE_READY';
  if (project.request) return 'REQUESTED';
  return 'DESIGN';
}

function projectSummary(project: DashboardAgentProject) {
  return {
    workspaceId: project.workspaceId,
    projectName: project.projectName,
    updatedAt: project.updatedAt,
    draftVersion: project.draftVersion,
    roles: project.roles,
    stage: projectStage(project),
    request: project.request,
    quote: project.quote,
    accepted: project.accepted,
    draftOrder: project.draftOrder,
  };
}

export function DashboardWebMcp({
  projects,
  canCreate,
  reviewFlow,
}: {
  readonly projects: readonly DashboardAgentProject[];
  readonly canCreate: boolean;
  readonly reviewFlow?: JudgeReviewFlow;
}) {
  const [registration, setRegistration] = useState<
    'checking' | 'registered' | 'unsupported' | 'failed'
  >('checking');
  const [activeReviewFlow, setActiveReviewFlow] = useState(reviewFlow);

  useEffect(() => setActiveReviewFlow(reviewFlow), [reviewFlow]);

  const tools = useMemo(() => {
    const available: WebMcpTool[] = [
      {
        name: 'inspect_projects',
        title: 'Inspect Attune projects',
        description:
          'Use on the dashboard to find recent projects and their request, quote, acceptance, and Draft Order stage. Returns only projects available to the signed-in user.',
        inputSchema: {
          type: 'object',
          properties: {
            stage: {
              type: 'string',
              enum: [
                'all',
                'design',
                'requested',
                'quote_ready',
                'accepted',
                'shopify_draft_order',
              ],
            },
          },
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          untrustedContentHint: true,
        },
        execute(input) {
          const value = input === undefined ? {} : record(input, 'inspect_projects input');
          exact(value, ['stage'], 'inspect_projects input');
          const stage = typeof value.stage === 'string' ? value.stage.toUpperCase() : 'ALL';
          const selected = projects
            .filter((project) => stage === 'ALL' || projectStage(project) === stage)
            .slice(0, 12)
            .map(projectSummary);
          return {
            totalProjects: projects.length,
            matchingProjects: selected.length,
            projects: selected,
          };
        },
      },
    ];
    if (canCreate) {
      available.push({
        name: 'create_project',
        title: 'Create an Attune project',
        description:
          'Use when the signed-in user asks to create a project from a blank or spoke template. Creates the project and opens its design workspace.',
        inputSchema: {
          type: 'object',
          properties: { template: { type: 'string', enum: ['blank', 'spoke'] } },
          required: ['template'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
          untrustedContentHint: false,
        },
        async execute(input, execution) {
          const value = record(input, 'create_project input');
          exact(value, ['template'], 'create_project input');
          if (value.template !== 'blank' && value.template !== 'spoke') {
            throw new TypeError('template must be blank or spoke.');
          }
          const response = await fetch('/api/projects', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ template: value.template }),
            signal: execution?.signal,
          });
          const payload: unknown = await response.json().catch(() => null);
          const workspaceId =
            typeof payload === 'object' && payload !== null
              ? Reflect.get(payload, 'workspaceId')
              : undefined;
          if (!response.ok || typeof workspaceId !== 'string') {
            const message =
              typeof payload === 'object' && payload !== null
                ? Reflect.get(payload, 'error')
                : null;
            throw new Error(
              typeof message === 'string' ? message : 'The project could not be created.',
            );
          }
          execution?.signal?.throwIfAborted();
          window.location.assign(`/workspace/${encodeURIComponent(workspaceId)}`);
          return { status: 'PROJECT_CREATED', workspaceId, opened: true };
        },
      });
    }
    if (projects.length) {
      available.push({
        name: 'open_project',
        title: 'Open an Attune project',
        description:
          'Use when the user asks to open one accessible project on its design, Buyer, or Maker workflow surface. Navigation never changes workspace authority.',
        inputSchema: {
          type: 'object',
          properties: {
            workspace_id: { type: 'string' },
            surface: {
              type: 'string',
              enum: [
                'design',
                'buyer_requests',
                'buyer_orders',
                'provider_requests',
                'provider_jobs',
                'provider_profile',
              ],
            },
          },
          required: ['workspace_id', 'surface'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          untrustedContentHint: false,
        },
        execute(input) {
          const value = record(input, 'open_project input');
          exact(value, ['workspace_id', 'surface'], 'open_project input');
          const project = projects.find(({ workspaceId }) => workspaceId === value.workspace_id);
          if (!project) throw new Error('That project is not available to the signed-in user.');
          if (typeof value.surface !== 'string') throw new TypeError('surface is required.');
          const providerSurface = value.surface.startsWith('provider_');
          const buyerSurface = value.surface.startsWith('buyer_');
          if (providerSurface && !project.roles.includes('provider')) {
            throw new Error('Maker access is unavailable for this project.');
          }
          if (buyerSurface && !project.roles.includes('buyer')) {
            throw new Error('Buyer access is unavailable for this project.');
          }
          const parameters = new URLSearchParams();
          if (providerSurface) parameters.set('perspective', 'provider');
          if (value.surface !== 'design') parameters.set('surface', value.surface);
          const target = `/workspace/${encodeURIComponent(project.workspaceId)}${parameters.size ? `?${parameters}` : ''}`;
          window.location.assign(target);
          return { status: 'NAVIGATION_INITIATED', workspaceId: project.workspaceId, target };
        },
      });
    }
    if (activeReviewFlow) {
      available.push(
        {
          name: 'inspect_review_flow',
          title: 'Inspect the judge review flow',
          description:
            'Use on the review dashboard to explain which seeded step is available, when later steps unlock, and why each surface matters. This inspection never mutates the workspace.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            untrustedContentHint: true,
          },
          execute(input) {
            const value = input === undefined ? {} : record(input, 'inspect_review_flow input');
            exact(value, [], 'inspect_review_flow input');
            return activeReviewFlow;
          },
        },
        {
          name: 'open_review_control_center',
          title: 'Open the judge control center',
          description:
            'Use when the judge asks to inspect environment readiness or reset controls. Gated workflow steps remain unchanged.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            untrustedContentHint: false,
          },
          execute(input) {
            const value =
              input === undefined ? {} : record(input, 'open_review_control_center input');
            exact(value, [], 'open_review_control_center input');
            window.location.assign('/judge');
            return { status: 'NAVIGATION_INITIATED', target: '/judge' };
          },
        },
        {
          name: 'reset_judge_workspace',
          title: 'Reset the seeded judge workspace',
          description:
            'Use only after the judge explicitly confirms that the seeded workspace should return to its clean starting state. Reset clears workflow history.',
          inputSchema: {
            type: 'object',
            properties: { user_confirmed: { type: 'boolean' } },
            required: ['user_confirmed'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: false,
            untrustedContentHint: false,
          },
          async execute(input, execution) {
            const value = record(input, 'reset_judge_workspace input');
            exact(value, ['user_confirmed'], 'reset_judge_workspace input');
            if (value.user_confirmed !== true) {
              return {
                status: 'USER_CONFIRMATION_REQUIRED',
                nextAction: 'Ask the judge to confirm that workflow records may be cleared.',
              };
            }
            const response = await fetch('/api/attune/reset', {
              method: 'POST',
              cache: 'no-store',
              headers: { Accept: 'application/json' },
              signal: execution?.signal,
            });
            const payload: unknown = await response.json().catch(() => null);
            if (!response.ok || !isAttuneApiView(payload)) {
              throw new Error('The seeded judge workspace could not be reset.');
            }
            const nextFlow = judgeReviewFlow(payload);
            setActiveReviewFlow(nextFlow);
            window.dispatchEvent(new CustomEvent('attune:workspace-changed', { detail: payload }));
            return { status: 'RESET_COMPLETE', reviewFlow: nextFlow };
          },
        },
      );
    }
    return available;
  }, [activeReviewFlow, canCreate, projects]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) {
      setRegistration('unsupported');
      return undefined;
    }
    const lifecycle = new AbortController();
    setRegistration('checking');
    void Promise.all(
      tools.map((tool) =>
        Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })),
      ),
    ).then(
      () => setRegistration('registered'),
      () => setRegistration('failed'),
    );
    return () => lifecycle.abort();
  }, [tools]);

  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<AppIcons.Agent size={18} />}
            aria-label={`Dashboard agent tools ${registration}`}
          >
            {registration === 'registered'
              ? `WebMCP on · ${tools.length}`
              : registration === 'unsupported'
                ? 'WebMCP unavailable'
                : registration === 'failed'
                  ? 'WebMCP failed'
                  : 'Detecting WebMCP'}
          </Button>
        }
      />
      <Popover.Content side="bottom" align="end" sideOffset={8} className="workspace-agent-popover">
        <Popover.Title className="workspace-agent-popover-title">Dashboard tools</Popover.Title>
        <p>
          {registration === 'registered'
            ? 'Only project tools useful on this dashboard are active. Opening a workspace replaces them with role- and state-specific tools.'
            : registration === 'unsupported'
              ? 'Enable WebMCP in a supported Chrome build to expose these contextual tools.'
              : registration === 'failed'
                ? 'The browser did not accept the dashboard tool registration.'
                : 'Registering page-scoped tools…'}
        </p>
        <div className="workspace-agent-popover-footer">
          {tools.map(({ name }) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      </Popover.Content>
    </Popover>
  );
}
