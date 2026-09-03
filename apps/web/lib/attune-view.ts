import type { ForecastConsequence } from '@attune/command-bus';
import {
  type AttuneWorkspace,
  type PanelGeometry,
  type SelectionContext,
  type SketchDocument,
} from '@attune/domain';

export type CapabilityRole = 'buyer' | 'provider' | 'reviewer';

export interface CapabilityView {
  readonly id: string;
  readonly capabilityEpoch: number;
  readonly description: string;
  readonly predictedConsequences: readonly string[];
  readonly available: boolean;
  readonly reason: string | null;
  readonly blockers: readonly { readonly code: string; readonly message: string }[];
}

export interface AttuneApiView {
  readonly perspective: CapabilityRole;
  readonly authority: {
    readonly perspectives: readonly Extract<CapabilityRole, 'buyer' | 'provider'>[];
    readonly capabilityIds: readonly string[];
    readonly authorityEpoch: number;
  };
  readonly delegation: {
    readonly status: 'active' | 'required' | 'expired' | 'revalidation_required';
    readonly expiresAt?: string;
    readonly authorityEpoch: number;
  };
  readonly product: {
    readonly workspaceId: string;
    readonly projectName: string;
    readonly fileName: string;
    readonly liveblocksRoomId: string;
  };
  readonly specHash: string;
  readonly workspace: {
    readonly commitmentId: 'AT-1042';
    readonly workspaceSeq: number;
    readonly draftVersion: number;
    readonly capabilityEpoch: number;
    readonly authorityEpoch: number;
    readonly fabricationQuantity: 4;
    readonly providerCapabilityProfile: {
      readonly profileId: string;
      readonly providerId: string;
      readonly providerName: string;
      readonly version: string;
    };
    readonly geometry: PanelGeometry;
    readonly sketchDocument: SketchDocument;
    readonly quoteRequests: readonly {
      readonly id: string;
      readonly draftVersion: number;
      readonly specHash: string;
      readonly specRevision: string;
    }[];
    readonly frozenRevisions: readonly {
      readonly revisionId: string;
      readonly specHash: string;
      readonly provider: {
        readonly providerId: string;
        readonly profileId: string;
        readonly profileVersion: string;
      };
      readonly frozenAt: string;
    }[];
    readonly quotes: readonly {
      readonly quoteId: string;
      readonly revisionId: string;
      readonly specHash: string;
      readonly amountMinor: number;
      readonly currency: string;
      readonly panelCount: number;
      readonly commerceLotQuantity: number;
    }[];
    readonly acceptances: readonly {
      readonly acceptanceId: string;
      readonly quoteId: string;
      readonly revisionId: string;
      readonly specHash: string;
    }[];
    readonly manufacturingRequests: readonly {
      readonly requestId: string;
      readonly specRevision: string;
      readonly specHash: string;
      readonly provider: {
        readonly providerId: string;
        readonly profileId: string;
        readonly profileVersion: string;
      };
      readonly visibility: 'PRIVATE' | 'DISCOVERABLE';
      readonly status:
        | 'PROVIDER_REVIEW_REQUESTED'
        | 'QUOTED'
        | 'ACCEPTED'
        | 'COMMERCE_READY'
        | 'EXTERNAL_DRIFT';
      readonly requestedAt: string;
      readonly updatedAt: string;
    }[];
    readonly externalCommerceRecords: readonly {
      readonly externalId: string;
      readonly kind: 'SHOPIFY_DRAFT_ORDER';
      readonly status: string;
      readonly requestId: string;
      readonly specRevision: string;
      readonly specHash: string;
      readonly syncState: 'IN_SYNC' | 'EXTERNAL_DRIFT';
      readonly synchronizedAt: string;
    }[];
    readonly commerceLinks: readonly CommerceLinkView[];
  };
  readonly validation: {
    readonly valid: boolean;
    readonly issues: readonly {
      readonly id: string;
      readonly source: 'universal' | 'provider';
      readonly message: string;
    }[];
    readonly universal: { readonly valid: boolean; readonly issues: readonly unknown[] };
    readonly provider: {
      readonly valid: boolean;
      readonly providerId: string;
      readonly profileId: string;
      readonly profileVersion: string;
      readonly issues: readonly unknown[];
    };
    readonly evidence: {
      readonly slotRightClearanceMm: number;
      readonly requiredSlotClearanceMm: number;
      readonly lockedMountsPreserved: number;
      readonly lockedMountsTotal: number;
      readonly providerId: string;
      readonly providerProfileVersion: string;
    };
  };
  readonly capabilities: readonly CapabilityView[];
  readonly frontier: readonly CapabilityView[];
  readonly frontiers: Readonly<Record<CapabilityRole, readonly CapabilityView[]>>;
  readonly repairs: readonly {
    readonly id: RepairId;
    readonly label: string;
    readonly predictedClearanceMm: number;
    readonly predictedSpecHash: string;
    readonly preservedLockedEntities: readonly string[];
  }[];
  readonly observation: {
    readonly previousWorkspaceSeq: number;
    readonly currentWorkspaceSeq: number;
    readonly interventions: readonly {
      readonly receiptSeq: number;
      readonly origin: string;
      readonly command: string;
      readonly affectedEntities: readonly string[];
      readonly beforeHash: string;
      readonly afterHash: string;
    }[];
  };
  readonly records: {
    readonly receipts: readonly ReceiptView[];
    readonly capabilityTransitions: readonly CapabilityTransitionView[];
    readonly commandRejections: readonly RejectionView[];
    readonly externalCommerce: AttuneApiView['workspace']['externalCommerceRecords'];
    readonly externalVerifications: readonly CommerceLinkView[];
  };
  readonly latestReceipt: ReceiptView | null;
  readonly latestCapabilityTransition: CapabilityTransitionView | null;
  readonly receiptCount: number;
  readonly impact: {
    readonly needToBuildableMs: number | null;
    readonly conflictsCaughtBeforeQuote: number;
    readonly lockedRequirementsPreserved: {
      readonly preserved: number;
      readonly total: number;
    };
    readonly humanInterventionsDetected: number;
    readonly staleConsequentialActionsBlocked: number;
    readonly exactRevisionShopifyVerifications: number;
    readonly goldenPath: { readonly completedRuns: number; readonly startedRuns: number };
  };
  readonly semantic: {
    readonly documentRevision: number;
    readonly selection: SelectionContext;
    readonly rankedConstraintCandidates: readonly {
      readonly type: string;
      readonly refs: readonly { readonly entityId: string; readonly anchor?: string }[];
      readonly score: number;
      readonly reason: string;
      readonly predictedEffect: string;
    }[];
    readonly availableActions: readonly string[];
    readonly solve: SketchDocument['lastSolve'] | null;
  };
}

export type RepairId = 'move_slot_left_to_clearance' | 'narrow_slot_to_clearance';

export interface HumanSemanticMutationResponse {
  readonly mutation: {
    readonly status: 'APPLIED';
    readonly workspaceSequence: number;
    readonly draftVersion: number;
    readonly capabilityEpoch: number;
    readonly authorityEpoch: number;
    readonly specificationHash: string;
    readonly changedEntities: readonly string[];
  };
  readonly workspace: AttuneWorkspace;
}

export interface ReceiptView {
  readonly receiptSeq: number;
  readonly receiptId: string;
  readonly commandId: string;
  readonly command: string;
  readonly origin: string;
  readonly principalId: string;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly specHashBefore: string;
  readonly specHashAfter: string;
  readonly preservedLocks: readonly string[];
  readonly workspaceSeq: number;
  readonly draftVersion: number;
  readonly capabilityEpoch: number;
  readonly createdAt: string;
  readonly rebasedFromWorkspaceSeq: number | null;
  readonly consequence: ForecastConsequence;
}

export interface CapabilityTransitionView {
  readonly transitionId: string;
  readonly receiptId: string;
  readonly workspaceSeq: number;
  readonly capabilityEpoch: number;
  readonly gained: readonly {
    readonly role: CapabilityRole;
    readonly capabilityId: string;
  }[];
  readonly lost: readonly {
    readonly role: CapabilityRole;
    readonly capabilityId: string;
  }[];
}

export interface RejectionView {
  readonly rejectionId: string;
  readonly commandId: string;
  readonly command: string;
  readonly origin: string;
  readonly principalId: string;
  readonly code: string;
  readonly workspaceSeq: number;
  readonly capabilityEpoch: number;
  readonly currentSpecHash: string;
  readonly createdAt: string;
}

export interface CommerceLinkView {
  readonly commerceLinkId: string;
  readonly revisionId: string;
  readonly specHash: string;
  readonly status: 'VERIFIED';
  readonly verification: {
    readonly adminVerified: true;
    readonly publicationVerified: true;
    readonly storefrontVerified: true;
    readonly productId: string;
    readonly variantId: string;
    readonly publicationId: string;
    readonly storefrontUrl: string;
    readonly commitmentId: 'AT-1042';
    readonly revisionId: 'r7';
    readonly specHash: string;
    readonly title: string;
    readonly sku: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly panelCount: number;
    readonly verifiedAt: string;
  };
}

export class AttuneHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly changedEntities: readonly string[] = [],
    readonly latestVersions: Readonly<Record<string, number>> = {},
    readonly canRetry = retryable,
  ) {
    super(message);
    this.name = 'AttuneHttpError';
  }
}

export function isAttuneApiView(value: unknown): value is AttuneApiView {
  if (typeof value !== 'object' || value === null) return false;
  const workspace = Reflect.get(value, 'workspace');
  const specHash = Reflect.get(value, 'specHash');
  return (
    typeof workspace === 'object' &&
    workspace !== null &&
    Reflect.get(workspace, 'commitmentId') === 'AT-1042' &&
    Number.isInteger(Reflect.get(workspace, 'workspaceSeq')) &&
    typeof specHash === 'string'
  );
}

function isHumanSemanticMutationResponse(value: unknown): value is HumanSemanticMutationResponse {
  if (typeof value !== 'object' || value === null) return false;
  const mutation = Reflect.get(value, 'mutation');
  const workspace = Reflect.get(value, 'workspace');
  return (
    typeof mutation === 'object' &&
    mutation !== null &&
    Reflect.get(mutation, 'status') === 'APPLIED' &&
    Number.isInteger(Reflect.get(mutation, 'workspaceSequence')) &&
    typeof Reflect.get(mutation, 'specificationHash') === 'string' &&
    typeof workspace === 'object' &&
    workspace !== null &&
    Reflect.get(workspace, 'commitmentId') === 'AT-1042'
  );
}

function jsonHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');
  return headers;
}

export function attuneWorkspaceEndpoint(
  path: string,
  workspaceId: string,
  parameters?: Readonly<Record<string, string | number>>,
): string {
  const search = new URLSearchParams({ workspace_id: workspaceId });
  for (const [name, value] of Object.entries(parameters ?? {})) search.set(name, String(value));
  return `${path}?${search}`;
}

export async function requestAttuneView(path: string, init?: RequestInit): Promise<AttuneApiView> {
  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers: jsonHeaders(init?.headers),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error =
      typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : undefined;
    const code =
      typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : 'REQUEST_FAILED';
    const message =
      typeof error === 'object' && error !== null
        ? Reflect.get(error, 'message')
        : 'The authoritative request failed.';
    const retryable =
      typeof error === 'object' && error !== null && Reflect.get(error, 'retryable') === true;
    throw new AttuneHttpError(
      response.status,
      typeof code === 'string' ? code : 'REQUEST_FAILED',
      typeof message === 'string' ? message : 'The authoritative request failed.',
      retryable,
    );
  }
  if (!isAttuneApiView(payload)) throw new TypeError('Attune returned an invalid workspace view.');
  return payload;
}

export function commandRequestBody(
  view: AttuneApiView,
  command: Readonly<Record<string, unknown>>,
  originPrefix: string,
  observationCursor?: number,
) {
  return JSON.stringify({
    command,
    commandId: `${originPrefix}-${crypto.randomUUID()}`,
    expectedWorkspaceSeq: view.workspace.workspaceSeq,
    expectedCapabilityEpoch: view.workspace.capabilityEpoch,
    expectedAuthorityEpoch: view.workspace.authorityEpoch,
    expectedSpecHash: view.specHash,
    observationCursor,
  });
}

export async function requestHumanSemanticMutation(
  path: string,
  view: AttuneApiView,
  command: Readonly<Record<string, unknown>>,
): Promise<HumanSemanticMutationResponse> {
  const response = await fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: jsonHeaders(),
    body: commandRequestBody(view, command, 'human', view.workspace.workspaceSeq),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error =
      typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'error') : undefined;
    const code =
      typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
    const message =
      typeof error === 'object' && error !== null
        ? Reflect.get(error, 'message')
        : 'The semantic mutation failed.';
    const retryable =
      typeof error === 'object' && error !== null && Reflect.get(error, 'retryable') === true;
    const rawChangedEntities: readonly unknown[] =
      typeof error === 'object' &&
      error !== null &&
      Array.isArray(Reflect.get(error, 'changedEntities'))
        ? Reflect.get(error, 'changedEntities')
        : [];
    const changedEntities = rawChangedEntities.filter(
      (entity): entity is string => typeof entity === 'string',
    );
    throw new AttuneHttpError(
      response.status,
      typeof code === 'string' ? code : 'SEMANTIC_MUTATION_FAILED',
      typeof message === 'string' ? message : 'The semantic mutation failed.',
      retryable,
      changedEntities,
    );
  }
  if (!isHumanSemanticMutationResponse(payload)) {
    throw new TypeError('Attune returned an invalid semantic mutation result.');
  }
  return payload;
}
