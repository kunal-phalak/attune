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

export interface CompiledCapability {
  readonly id: CapabilityId;
  readonly capabilityEpoch: number;
  readonly description: string;
  readonly predictedConsequences: readonly string[];
}

const COMMAND_CAPABILITY: Readonly<Partial<Record<AttuneCommandType, CapabilityId>>> = {
  apply_deterministic_repair: 'apply_deterministic_repair',
  move_slot: 'edit_draft',
  request_quote: 'request_quote',
  freeze_and_quote_revision: 'freeze_and_quote_revision',
  accept_revision: 'accept_revision',
  materialize_for_commerce: 'materialize_for_commerce',
};

function capability(
  workspace: AttuneWorkspace,
  id: CapabilityId,
  description: string,
  predictedConsequences: readonly string[],
): CompiledCapability {
  return { id, capabilityEpoch: workspace.capabilityEpoch, description, predictedConsequences };
}

function currentAuthority(workspace: AttuneWorkspace) {
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

type Authority = ReturnType<typeof currentAuthority>;

interface CompilerContext {
  readonly workspace: AttuneWorkspace;
  readonly role: AttuneRole;
  readonly valid: boolean;
  readonly authority: Authority;
}

function canEdit(role: AttuneRole): boolean {
  return role === 'buyer' || role === 'agent';
}

function editCapabilities(context: CompilerContext): readonly CompiledCapability[] {
  if (!canEdit(context.role)) return [];
  return [
    capability(context.workspace, 'edit_draft', 'Move an editable feature in the current draft.', [
      'Increments draft version and capability epoch.',
      'Invalidates authority tied to the previous specification.',
    ]),
  ];
}

function repairCapabilities(context: CompilerContext): readonly CompiledCapability[] {
  if (context.valid || !canEdit(context.role)) return [];
  return [
    capability(
      context.workspace,
      'compare_valid_changes',
      'Compare deterministic repairs for hard conflicts.',
      [`${compareValidChanges(context.workspace).length} valid repairs are currently available.`],
    ),
    capability(
      context.workspace,
      'apply_deterministic_repair',
      'Apply one exact predicted repair.',
      ['Resolves slot clearance while preserving all four locked mounts.'],
    ),
  ];
}

function quoteRequestCapabilities(context: CompilerContext): readonly CompiledCapability[] {
  const { authority, role, valid, workspace } = context;
  if (!valid || role !== 'buyer' || authority.request || authority.quote) return [];
  return [
    capability(
      workspace,
      'request_quote',
      'Request a provider quote for the exact specification.',
      [`Binds the request to ${authority.specHash}.`],
    ),
  ];
}

function providerCapabilities(context: CompilerContext): readonly CompiledCapability[] {
  const { authority, role, workspace } = context;
  if (role !== 'provider' || !authority.request || authority.quote) return [];
  return [
    capability(
      workspace,
      'freeze_and_quote_revision',
      'Freeze and quote the requested specification.',
      [
        `Creates immutable ${authority.revisionId}.`,
        'Quotes one four-panel fabrication lot at ₹2,400.',
      ],
    ),
  ];
}

function acceptanceCapabilities(context: CompilerContext): readonly CompiledCapability[] {
  const { authority, role, workspace } = context;
  if (role !== 'buyer' || !authority.revision || !authority.quote || authority.acceptance)
    return [];
  return [
    capability(workspace, 'accept_revision', 'Accept the exact quoted frozen revision.', [
      `Accepts ${authority.revisionId} and its exact specification hash.`,
    ]),
  ];
}

function commerceCapabilities(context: CompilerContext): readonly CompiledCapability[] {
  const { authority, role, workspace } = context;
  if (role !== 'agent' || !authority.acceptance || authority.commerce) return [];
  return [
    capability(
      workspace,
      'materialize_for_commerce',
      'Materialize the accepted revision in Shopify.',
      [
        'Requires exact Admin, publication, and Storefront verification.',
        'Creates one purchasable lot representing four physical panels.',
      ],
    ),
  ];
}

function navigationCapabilities(context: CompilerContext): readonly CompiledCapability[] {
  const { authority, workspace } = context;
  if (!authority.commerce) return [];
  return [
    capability(workspace, 'navigate_to_storefront', 'Open the independently verified product.', [
      `Navigates to ${authority.commerce.verification.storefrontUrl}.`,
    ]),
  ];
}

const CAPABILITY_BUILDERS = [
  editCapabilities,
  repairCapabilities,
  quoteRequestCapabilities,
  providerCapabilities,
  acceptanceCapabilities,
  commerceCapabilities,
  navigationCapabilities,
] as const;

export function compileCapabilities(
  workspace: AttuneWorkspace,
  role: AttuneRole,
): readonly CompiledCapability[] {
  const context: CompilerContext = {
    workspace,
    role,
    valid: validateWorkspace(workspace).valid,
    authority: currentAuthority(workspace),
  };
  return CAPABILITY_BUILDERS.flatMap((build) => build(context));
}

export function requiredCapability(commandType: AttuneCommandType): CapabilityId | undefined {
  return COMMAND_CAPABILITY[commandType];
}
