import {
  compareValidChanges,
  hashSpecification,
  validateWorkspace,
  type AttuneCommandType,
  type AttuneRole,
  type AttuneWorkspace,
} from '@attune/domain';

export type CapabilityId =
  | 'compare_valid_changes'
  | 'apply_deterministic_repair'
  | 'edit_draft'
  | 'request_quote'
  | 'freeze_and_quote_revision'
  | 'accept_revision'
  | 'materialize_for_commerce'
  | 'navigate_to_storefront';

export type CapabilityBlockerCode =
  | 'ROLE_REQUIRED'
  | 'SPECIFICATION_INVALID'
  | 'NO_HARD_CONFLICT'
  | 'QUOTE_ALREADY_REQUESTED'
  | 'QUOTE_REQUEST_MISSING'
  | 'QUOTE_ALREADY_EXISTS'
  | 'FROZEN_REVISION_MISSING'
  | 'ACCEPTANCE_ALREADY_EXISTS'
  | 'ACCEPTANCE_MISSING'
  | 'COMMERCE_ALREADY_VERIFIED'
  | 'COMMERCE_VERIFICATION_MISSING';

export interface CapabilityBlocker {
  readonly code: CapabilityBlockerCode;
  readonly message: string;
}

interface CapabilityBase {
  readonly id: CapabilityId;
  readonly capabilityEpoch: number;
  readonly description: string;
  readonly predictedConsequences: readonly string[];
}

export interface CompiledCapability extends CapabilityBase {
  readonly available: true;
  readonly reason: string;
  readonly blockers: readonly [];
}

export interface BlockedCapability extends CapabilityBase {
  readonly available: false;
  readonly reason: null;
  readonly blockers: readonly CapabilityBlocker[];
}

export type CapabilityFrontierEntry = CompiledCapability | BlockedCapability;

const COMMAND_CAPABILITY: Readonly<Partial<Record<AttuneCommandType, CapabilityId>>> = {
  apply_deterministic_repair: 'apply_deterministic_repair',
  move_slot: 'edit_draft',
  request_quote: 'request_quote',
  freeze_and_quote_revision: 'freeze_and_quote_revision',
  accept_revision: 'accept_revision',
  materialize_for_commerce: 'materialize_for_commerce',
};

export function deriveCurrentAuthority(workspace: AttuneWorkspace) {
  const specHash = hashSpecification(workspace);
  const revisionId = `r${workspace.draftVersion}`;
  const request = workspace.quoteRequests.find(
    (candidate) =>
      candidate.draftVersion === workspace.draftVersion && candidate.specHash === specHash,
  );
  const revision = workspace.frozenRevisions.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );
  const quote = workspace.quotes.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );
  const acceptance = workspace.acceptances.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );
  const commerce = workspace.commerceLinks.find(
    (candidate) => candidate.revisionId === revisionId && candidate.specHash === specHash,
  );

  return { acceptance, commerce, quote, request, revision, revisionId, specHash };
}

type Authority = ReturnType<typeof deriveCurrentAuthority>;

interface CompilerContext {
  readonly workspace: AttuneWorkspace;
  readonly role: AttuneRole;
  readonly valid: boolean;
  readonly authority: Authority;
}

interface CapabilityDefinition {
  readonly id: CapabilityId;
  readonly description: (context: CompilerContext) => string;
  readonly predictedConsequences: (context: CompilerContext) => readonly string[];
  readonly blockers: (context: CompilerContext) => readonly CapabilityBlocker[];
  readonly reason: (context: CompilerContext) => string;
}

function blocker(code: CapabilityBlockerCode, message: string): CapabilityBlocker {
  return { code, message };
}

function requireRole(context: CompilerContext, roles: readonly AttuneRole[]) {
  return roles.includes(context.role)
    ? []
    : [blocker('ROLE_REQUIRED', `Requires role: ${roles.join(' or ')}.`)];
}

function editBlockers(context: CompilerContext) {
  return requireRole(context, ['buyer', 'agent']);
}

function conflictBlockers(context: CompilerContext) {
  return [
    ...requireRole(context, ['buyer', 'agent']),
    ...(context.valid
      ? [blocker('NO_HARD_CONFLICT', 'The current specification has no hard conflict to repair.')]
      : []),
  ];
}

function requestBlockers(context: CompilerContext) {
  const { authority, valid } = context;
  return [
    ...requireRole(context, ['buyer']),
    ...(!valid
      ? [blocker('SPECIFICATION_INVALID', 'Resolve every hard conflict before requesting a quote.')]
      : []),
    ...(authority.request
      ? [
          blocker(
            'QUOTE_ALREADY_REQUESTED',
            'This exact specification already has a quote request.',
          ),
        ]
      : []),
    ...(authority.quote
      ? [blocker('QUOTE_ALREADY_EXISTS', 'This exact specification is already quoted.')]
      : []),
  ];
}

function quoteBlockers(context: CompilerContext) {
  const { authority } = context;
  return [
    ...requireRole(context, ['provider']),
    ...(!authority.request
      ? [blocker('QUOTE_REQUEST_MISSING', 'The current specification has no buyer quote request.')]
      : []),
    ...(authority.quote
      ? [blocker('QUOTE_ALREADY_EXISTS', 'The current specification is already frozen and quoted.')]
      : []),
  ];
}

function acceptanceBlockers(context: CompilerContext) {
  const { authority } = context;
  return [
    ...requireRole(context, ['buyer']),
    ...(!authority.revision || !authority.quote
      ? [
          blocker(
            'FROZEN_REVISION_MISSING',
            'A provider must freeze and quote this exact specification first.',
          ),
        ]
      : []),
    ...(authority.acceptance
      ? [blocker('ACCEPTANCE_ALREADY_EXISTS', 'This exact frozen revision is already accepted.')]
      : []),
  ];
}

function commerceBlockers(context: CompilerContext) {
  const { authority } = context;
  return [
    ...requireRole(context, ['agent']),
    ...(!authority.acceptance
      ? [
          blocker(
            'ACCEPTANCE_MISSING',
            'The exact current frozen revision has not been accepted by the buyer.',
          ),
        ]
      : []),
    ...(authority.commerce
      ? [
          blocker(
            'COMMERCE_ALREADY_VERIFIED',
            'The exact current frozen revision is already verified in commerce.',
          ),
        ]
      : []),
  ];
}

function navigationBlockers(context: CompilerContext) {
  return context.authority.commerce
    ? []
    : [
        blocker(
          'COMMERCE_VERIFICATION_MISSING',
          'No exact Admin, publication, and Storefront verification exists for the current revision.',
        ),
      ];
}

const DEFINITIONS: readonly CapabilityDefinition[] = [
  {
    id: 'compare_valid_changes',
    description: () => 'Compare deterministic repairs for hard conflicts.',
    predictedConsequences: ({ workspace }) => [
      `${compareValidChanges(workspace).length} valid repairs are currently available.`,
      'Does not mutate the specification.',
    ],
    blockers: conflictBlockers,
    reason: () => 'A hard manufacturability conflict has deterministic valid alternatives.',
  },
  {
    id: 'apply_deterministic_repair',
    description: () => 'Apply one exact predicted repair.',
    predictedConsequences: () => [
      'Resolves slot clearance while preserving all four buyer-locked mounts.',
      'Increments draft version and capability epoch.',
    ],
    blockers: conflictBlockers,
    reason: () => 'At least one predicted repair resolves the current hard conflict.',
  },
  {
    id: 'edit_draft',
    description: () => 'Move an editable feature in the current draft.',
    predictedConsequences: () => [
      'Increments draft version and capability epoch.',
      'Revokes authority tied to the previous specification.',
    ],
    blockers: editBlockers,
    reason: () => 'The slot is editable by the current principal.',
  },
  {
    id: 'request_quote',
    description: () => 'Request a provider quote for the exact specification.',
    predictedConsequences: ({ authority }) => [`Binds the request to ${authority.specHash}.`],
    blockers: requestBlockers,
    reason: () => 'The current specification is buildable and has no current quote authority.',
  },
  {
    id: 'freeze_and_quote_revision',
    description: () => 'Freeze and quote the requested specification.',
    predictedConsequences: ({ authority }) => [
      `Creates immutable ${authority.revisionId}.`,
      'Quotes one four-panel fabrication lot at ₹2,400.',
    ],
    blockers: quoteBlockers,
    reason: () => 'A buyer request matches the exact current specification hash.',
  },
  {
    id: 'accept_revision',
    description: () => 'Accept the exact quoted frozen revision.',
    predictedConsequences: ({ authority }) => [
      `Accepts ${authority.revisionId} and its exact specification hash.`,
      'Accrues commerce materialization authority for an agent.',
    ],
    blockers: acceptanceBlockers,
    reason: () => 'The provider quote and immutable revision match the current specification.',
  },
  {
    id: 'materialize_for_commerce',
    description: () => 'Materialize the accepted revision in Shopify.',
    predictedConsequences: () => [
      'Requires exact Admin, publication, and Storefront verification.',
      'Creates one purchasable lot representing four physical panels.',
    ],
    blockers: commerceBlockers,
    reason: () => 'Buyer acceptance matches the current frozen revision and specification hash.',
  },
  {
    id: 'navigate_to_storefront',
    description: () => 'Open the independently verified Shopify Liquid product.',
    predictedConsequences: ({ authority }) => [
      authority.commerce
        ? `Top-level navigation opens ${authority.commerce.verification.storefrontUrl}.`
        : 'Top-level navigation remains unavailable until external verification passes.',
      'Attune tools disappear with this document; Shopify-native WebMCP becomes authoritative.',
    ],
    blockers: navigationBlockers,
    reason: () =>
      'The exact current frozen revision has verified Admin, publication, and Storefront state.',
  },
];

function compileEntry(
  workspace: AttuneWorkspace,
  definition: CapabilityDefinition,
  context: CompilerContext,
): CapabilityFrontierEntry {
  const blockers = definition.blockers(context);
  const base = {
    id: definition.id,
    capabilityEpoch: workspace.capabilityEpoch,
    description: definition.description(context),
    predictedConsequences: definition.predictedConsequences(context),
  };

  return blockers.length === 0
    ? { ...base, available: true, reason: definition.reason(context), blockers: [] }
    : { ...base, available: false, reason: null, blockers };
}

export function compileCapabilityFrontier(
  workspace: AttuneWorkspace,
  role: AttuneRole,
): readonly CapabilityFrontierEntry[] {
  const context: CompilerContext = {
    workspace,
    role,
    valid: validateWorkspace(workspace).valid,
    authority: deriveCurrentAuthority(workspace),
  };
  return DEFINITIONS.map((definition) => compileEntry(workspace, definition, context));
}

export function compileCapabilities(
  workspace: AttuneWorkspace,
  role: AttuneRole,
): readonly CompiledCapability[] {
  return compileCapabilityFrontier(workspace, role).filter(
    (entry): entry is CompiledCapability => entry.available,
  );
}

export function requiredCapability(commandType: AttuneCommandType): CapabilityId | undefined {
  return COMMAND_CAPABILITY[commandType];
}
