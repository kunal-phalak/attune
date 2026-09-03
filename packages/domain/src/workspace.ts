import { applyRepairToGeometry, hashSpecification, validateGeometry } from './geometry';
import { createSpokeSeedDocument } from './maker/makerjs-adapter';
import type {
  AttuneCommand,
  AttuneWorkspace,
  ManufacturingConfiguration,
  PanelGeometry,
  ProviderBinding,
  ProviderCapabilityProfile,
} from './model';
import { applySketchCommand, isSketchCommand } from './sketch/commands';
import { emptySketchDocument, type SketchDocument } from './sketch/document';

export interface TransitionMetadata {
  readonly commandId: string;
  readonly now: string;
}

export interface DomainTransition {
  readonly workspace: AttuneWorkspace;
  readonly affectedEntities: readonly string[];
  readonly addedConstraints?: readonly string[];
  readonly removedConstraints?: readonly string[];
}

function assertNever(command: never): never {
  throw new TypeError(`Unsupported Attune command: ${JSON.stringify(command)}`);
}

function seedGeometry(): PanelGeometry {
  return {
    width: 420,
    height: 280,
    thickness: 3,
    material: 'aluminium',
    mounts: [
      { id: 'mount:top-left', center: { x: 24, y: 24 }, diameter: 8, locked: true },
      { id: 'mount:top-right', center: { x: 396, y: 24 }, diameter: 8, locked: true },
      { id: 'mount:bottom-left', center: { x: 24, y: 256 }, diameter: 8, locked: true },
      { id: 'mount:bottom-right', center: { x: 396, y: 256 }, diameter: 8, locked: true },
    ],
    auxiliaryHoles: [
      { id: 'hole:gland-left', center: { x: 92, y: 232 }, diameter: 22, locked: false },
      { id: 'hole:gland-center', center: { x: 148, y: 232 }, diameter: 22, locked: false },
      { id: 'hole:gland-right', center: { x: 204, y: 232 }, diameter: 22, locked: false },
    ],
    slot: {
      id: 'slot:connector',
      center: { x: 389.9, y: 218 },
      width: 44,
      height: 20,
      locked: false,
    },
    rectangularCutouts: [
      {
        id: 'cutout:display',
        center: { x: 132, y: 82 },
        width: 172,
        height: 86,
        cornerRadius: 5,
        locked: false,
      },
      {
        id: 'cutout:secondary-control',
        center: { x: 114, y: 166 },
        width: 68,
        height: 44,
        cornerRadius: 4,
        locked: false,
      },
    ],
    circularCutouts: [{ id: 'cutout:fan', center: { x: 314, y: 86 }, diameter: 96, locked: false }],
    ventSlots: Array.from({ length: 6 }, (_, index) => ({
      id: `slot:vent-${index + 1}`,
      center: { x: 310, y: 157 + index * 12 },
      width: 82,
      height: 6,
      locked: false,
    })),
    constraints: {
      requiredSlotClearance: 12,
      equalAuxiliaryHoles: true,
      symmetricAuxiliaryHoles: true,
    },
  };
}

export function createJudgeProviderCapabilityProfile(): ProviderCapabilityProfile {
  return {
    profileId: 'profile:attune-fabrication:laser:v1',
    providerId: 'provider:attune-fabrication',
    providerName: 'Attune Demo Fabrication',
    source: 'DEMO',
    version: 'v1',
    processes: [
      {
        id: 'process:sheet-cutting',
        name: '2D sheet cutting',
        machine: 'Attune sheet cell',
        workEnvelopeMm: { width: 600, height: 400, thickness: 12 },
      },
    ],
    materials: [
      { material: 'aluminium', thicknessesMm: [2, 3, 4] },
      { material: 'acrylic', thicknessesMm: [3, 5, 6] },
    ],
    toleranceMm: 0.2,
    minimums: {
      featureMm: 2,
      holeDiameterMm: 3,
      slotWidthMm: 3,
      edgeClearanceMm: 12,
      spacingWebMm: 3,
      toolRadiusMm: 'ANY',
      kerfMm: 0.2,
    },
    topology: {
      closedContour: true,
      noSelfIntersection: true,
      cutoutContainment: true,
      noInvalidOverlap: true,
    },
    supportedOperations: ['outer_profile', 'through_cut', 'hole', 'slot'],
    finishes: ['As cut', 'Brushed', 'Powder coated'],
    leadTimeDays: { min: 5, max: 10 },
    customRules: [],
    effectiveAt: '2026-08-29T00:00:00.000Z',
  };
}

export function providerBinding(workspace: AttuneWorkspace): ProviderBinding {
  const profile = workspace.providerCapabilityProfile;
  return {
    providerId: profile.providerId,
    profileId: profile.profileId,
    profileVersion: profile.version,
    ...(profile.shopify
      ? {
          shopDomain: profile.shopify.shopDomain,
          shopifyLocationId: profile.shopify.locationId,
        }
      : {}),
  };
}

function manufacturingConfiguration(workspace: AttuneWorkspace): ManufacturingConfiguration {
  return (
    workspace.manufacturingConfiguration ?? {
      material: workspace.geometry.material,
      thicknessMm: workspace.geometry.thickness,
      finish: 'As cut',
      quantity: workspace.fabricationQuantity,
      toleranceMm:
        typeof workspace.providerCapabilityProfile.toleranceMm === 'number'
          ? workspace.providerCapabilityProfile.toleranceMm
          : 0.2,
    }
  );
}

export function createAt1042Workspace(
  options: { readonly sketchTemplate?: 'blank' | 'spoke' } = {},
): AttuneWorkspace {
  return {
    scenarioVersion: 3,
    projectId: 'project:attune',
    commitmentId: 'AT-1042',
    workspaceSeq: 0,
    draftVersion: 6,
    capabilityEpoch: 1,
    authorityEpoch: 0,
    fabricationQuantity: 4,
    manufacturingConfiguration: {
      material: 'aluminium',
      thicknessMm: 3,
      finish: 'As cut',
      quantity: 4,
      toleranceMm: 0.2,
    },
    providerCapabilityProfile: createJudgeProviderCapabilityProfile(),
    geometry: seedGeometry(),
    sketchDocument:
      options.sketchTemplate === 'blank' ? emptySketchDocument() : createSpokeSeedDocument(),
    quoteRequests: [],
    frozenRevisions: [],
    quotes: [],
    acceptances: [],
    manufacturingRequests: [],
    externalCommerceRecords: [],
    commerceLinks: [],
  };
}

function advance(
  workspace: AttuneWorkspace,
  changes: Partial<AttuneWorkspace>,
  authorityChanged = true,
): AttuneWorkspace {
  return {
    ...workspace,
    ...changes,
    workspaceSeq: workspace.workspaceSeq + 1,
    capabilityEpoch: workspace.capabilityEpoch + 1,
    authorityEpoch: workspace.authorityEpoch + (authorityChanged ? 1 : 0),
  };
}

function hasCurrentConsequentialAuthority(workspace: AttuneWorkspace): boolean {
  const specHash = hashSpecification(workspace);
  const revisionId = `r${workspace.draftVersion}`;
  return [
    ...workspace.quoteRequests,
    ...workspace.frozenRevisions,
    ...workspace.quotes,
    ...workspace.acceptances,
    ...workspace.commerceLinks,
  ].some(
    (record) =>
      record.specHash === specHash &&
      (!('revisionId' in record) || record.revisionId === revisionId),
  );
}

function mutateDraft(workspace: AttuneWorkspace, geometry: PanelGeometry): AttuneWorkspace {
  return advance(
    workspace,
    {
      draftVersion: workspace.draftVersion + 1,
      geometry,
    },
    hasCurrentConsequentialAuthority(workspace),
  );
}

function mutateSketchDraft(
  workspace: AttuneWorkspace,
  sketchDocument: SketchDocument,
): AttuneWorkspace {
  return advance(
    workspace,
    { draftVersion: workspace.draftVersion + 1, sketchDocument },
    hasCurrentConsequentialAuthority(workspace),
  );
}

function freezeAndQuote(
  workspace: AttuneWorkspace,
  command: Extract<AttuneCommand, { type: 'freeze_and_quote_revision' }>,
  metadata: TransitionMetadata,
): AttuneWorkspace {
  const specHash = hashSpecification(workspace);
  const revisionId = `r${workspace.draftVersion}`;
  const request = workspace.quoteRequests.find(
    (candidate) =>
      candidate.draftVersion === workspace.draftVersion && candidate.specHash === specHash,
  );

  if (!request) {
    throw new Error(
      'A current quote request is required before the provider can freeze a revision.',
    );
  }
  const configuration =
    workspace.manufacturingRequests.find(({ requestId }) => requestId === request.id)
      ?.configuration ?? manufacturingConfiguration(workspace);
  const amountMinor = command.amountMinor ?? 240_000;
  const currency =
    command.currency ?? workspace.providerCapabilityProfile.shopify?.currency ?? 'INR';
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error('A provider quote requires a positive amount in minor currency units.');
  }

  return advance(workspace, {
    manufacturingRequests: workspace.manufacturingRequests.map((candidate) =>
      candidate.requestId === request.id
        ? { ...candidate, status: 'QUOTED' as const, updatedAt: metadata.now }
        : candidate,
    ),
    frozenRevisions: [
      ...workspace.frozenRevisions,
      {
        revisionId,
        draftVersion: workspace.draftVersion,
        specHash,
        provider: providerBinding(workspace),
        geometry: structuredClone(workspace.geometry),
        sketchDocument: structuredClone(workspace.sketchDocument),
        frozenAt: metadata.now,
      },
    ],
    quotes: [
      ...workspace.quotes,
      {
        quoteId: `quote:${metadata.commandId}`,
        revisionId,
        specHash,
        provider: providerBinding(workspace),
        amountMinor,
        currency,
        panelCount: configuration.quantity,
        commerceLotQuantity: 1,
        ...(command.leadTimeDays ? { leadTimeDays: command.leadTimeDays } : {}),
        ...(command.validUntil ? { validUntil: command.validUntil } : {}),
        quotedAt: metadata.now,
      },
    ],
  });
}

function acceptRevision(
  workspace: AttuneWorkspace,
  command: Extract<AttuneCommand, { type: 'accept_revision' }>,
  metadata: TransitionMetadata,
): AttuneWorkspace {
  const quote = workspace.quotes.find(
    (candidate) =>
      candidate.quoteId === command.quoteId && candidate.revisionId === command.revisionId,
  );

  if (!quote) {
    throw new Error('The requested revision and quote do not form an authoritative pair.');
  }

  return advance(workspace, {
    manufacturingRequests: workspace.manufacturingRequests.map((candidate) =>
      candidate.specRevision === quote.revisionId && candidate.specHash === quote.specHash
        ? { ...candidate, status: 'ACCEPTED' as const, updatedAt: metadata.now }
        : candidate,
    ),
    acceptances: [
      ...workspace.acceptances,
      {
        acceptanceId: `acceptance:${metadata.commandId}`,
        quoteId: quote.quoteId,
        revisionId: quote.revisionId,
        specHash: quote.specHash,
        provider: quote.provider,
        acceptedAt: metadata.now,
      },
    ],
  });
}

function synchronizeDraftOrder(
  workspace: AttuneWorkspace,
  command: Extract<AttuneCommand, { type: 'synchronize_shopify_draft_order' }>,
  metadata: TransitionMetadata,
): AttuneWorkspace {
  const request = workspace.manufacturingRequests.find(
    ({ requestId }) => requestId === command.snapshot.requestId,
  );
  if (!request) throw new Error('The Shopify Draft Order does not match an Attune request.');
  const quote = workspace.quotes.find(
    ({ revisionId, specHash }) =>
      revisionId === request.specRevision && specHash === request.specHash,
  );
  const exact =
    command.snapshot.specRevision === request.specRevision &&
    command.snapshot.specHash === request.specHash &&
    JSON.stringify(command.snapshot.provider) === JSON.stringify(request.provider) &&
    command.snapshot.amountMinor === quote?.amountMinor &&
    command.snapshot.currency === quote?.currency;
  const syncState = exact ? 'IN_SYNC' : 'EXTERNAL_DRIFT';
  const record = { ...command.snapshot, syncState, synchronizedAt: metadata.now } as const;

  return advance(workspace, {
    manufacturingRequests: workspace.manufacturingRequests.map((candidate) =>
      candidate.requestId === request.requestId
        ? {
            ...candidate,
            status: syncState === 'EXTERNAL_DRIFT' ? 'EXTERNAL_DRIFT' : candidate.status,
            updatedAt: metadata.now,
          }
        : candidate,
    ),
    externalCommerceRecords: [
      ...workspace.externalCommerceRecords.filter(
        ({ externalId }) => externalId !== command.snapshot.externalId,
      ),
      record,
    ],
  });
}

function materializeRevision(
  workspace: AttuneWorkspace,
  command: Extract<AttuneCommand, { type: 'materialize_for_commerce' }>,
  metadata: TransitionMetadata,
): AttuneWorkspace {
  const revision = workspace.frozenRevisions.find(
    (candidate) => candidate.revisionId === command.revisionId,
  );

  if (!revision || revision.specHash !== hashSpecification(workspace)) {
    throw new Error('Commerce materialization must target the exact current frozen specification.');
  }
  if (
    command.verification.commitmentId !== workspace.commitmentId ||
    command.verification.revisionId !== revision.revisionId ||
    command.verification.specHash !== revision.specHash
  ) {
    throw new Error('Shopify verification must link the exact frozen Attune revision and hash.');
  }

  return advance(workspace, {
    commerceLinks: [
      ...workspace.commerceLinks,
      {
        commerceLinkId: `commerce:${metadata.commandId}`,
        revisionId: revision.revisionId,
        specHash: revision.specHash,
        status: 'VERIFIED',
        verification: command.verification,
      },
    ],
  });
}

export function transitionWorkspace(
  workspace: AttuneWorkspace,
  command: AttuneCommand,
  metadata: TransitionMetadata,
  options: { readonly solvedSketchDocument?: SketchDocument } = {},
): DomainTransition {
  if (isSketchCommand(command)) {
    const application = applySketchCommand(workspace.sketchDocument, command);
    return {
      workspace: mutateSketchDraft(workspace, options.solvedSketchDocument ?? application.document),
      affectedEntities: application.affectedEntities,
      addedConstraints: application.addedConstraints,
      removedConstraints: application.removedConstraints,
    };
  }

  switch (command.type) {
    case 'apply_deterministic_repair':
      return {
        workspace: mutateDraft(
          workspace,
          applyRepairToGeometry(
            workspace.geometry,
            command.repairId,
            typeof workspace.providerCapabilityProfile.minimums.edgeClearanceMm === 'number'
              ? workspace.providerCapabilityProfile.minimums.edgeClearanceMm
              : workspace.geometry.constraints.requiredSlotClearance,
          ),
        ),
        affectedEntities: ['slot:connector'],
      };
    case 'move_slot':
      return {
        workspace: mutateDraft(workspace, {
          ...workspace.geometry,
          slot: {
            ...workspace.geometry.slot,
            center: { x: command.centerX, y: command.centerY },
          },
        }),
        affectedEntities: ['slot:connector'],
      };
    case 'synchronize_provider_profile':
      return {
        workspace: advance(workspace, { providerCapabilityProfile: command.profile }),
        affectedEntities: [command.profile.providerId, command.profile.profileId],
      };
    case 'request_quote': {
      const requestId = `quote-request:${metadata.commandId}`;
      const configuration = command.configuration ?? manufacturingConfiguration(workspace);
      if (
        !Number.isSafeInteger(configuration.quantity) ||
        configuration.quantity <= 0 ||
        configuration.thicknessMm <= 0 ||
        configuration.toleranceMm <= 0
      ) {
        throw new Error('Manufacturing configuration values must be positive.');
      }
      const configured = {
        ...workspace,
        fabricationQuantity: configuration.quantity,
        manufacturingConfiguration: configuration,
        geometry: {
          ...workspace.geometry,
          material: configuration.material,
          thickness: configuration.thicknessMm,
        },
      };
      if (!validateGeometry(configured.geometry, configured.providerCapabilityProfile).valid) {
        throw new Error('The selected manufacturing configuration is not compatible.');
      }
      const specRevision = `r${configured.draftVersion}`;
      const specHash = hashSpecification(configured);
      const provider = providerBinding(configured);
      return {
        workspace: advance(configured, {
          quoteRequests: [
            ...workspace.quoteRequests,
            {
              id: requestId,
              draftVersion: workspace.draftVersion,
              specHash,
              specRevision,
              provider,
              requestedAt: metadata.now,
            },
          ],
          manufacturingRequests: [
            ...workspace.manufacturingRequests,
            {
              requestId,
              specRevision,
              specHash,
              provider,
              visibility: 'PRIVATE',
              status: 'PROVIDER_REVIEW_REQUESTED',
              configuration,
              providerProfileVersion: provider.profileVersion,
              ...(provider.shopDomain ? { shopDomain: provider.shopDomain } : {}),
              ...(provider.shopifyLocationId
                ? { shopifyLocationId: provider.shopifyLocationId }
                : {}),
              ...(command.buyerPrincipalId ? { buyerPrincipalId: command.buyerPrincipalId } : {}),
              requestedAt: metadata.now,
              updatedAt: metadata.now,
            },
          ],
        }),
        affectedEntities: ['commitment:AT-1042'],
      };
    }
    case 'freeze_and_quote_revision':
      return {
        workspace: freezeAndQuote(workspace, command, metadata),
        affectedEntities: [`revision:r${workspace.draftVersion}`, 'quote:current'],
      };
    case 'accept_revision':
      return {
        workspace: acceptRevision(workspace, command, metadata),
        affectedEntities: [`revision:${command.revisionId}`, command.quoteId],
      };
    case 'synchronize_shopify_draft_order':
      return {
        workspace: synchronizeDraftOrder(workspace, command, metadata),
        affectedEntities: [command.snapshot.requestId, command.snapshot.externalId],
      };
    case 'materialize_for_commerce':
      return {
        workspace: materializeRevision(workspace, command, metadata),
        affectedEntities: [`revision:${command.revisionId}`, command.verification.productId],
      };
  }

  return assertNever(command);
}

export function validateWorkspace(workspace: AttuneWorkspace) {
  return validateGeometry(workspace.geometry, workspace.providerCapabilityProfile);
}
