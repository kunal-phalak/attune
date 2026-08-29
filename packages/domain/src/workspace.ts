import { applyRepairToGeometry, hashSpecification, validateGeometry } from './geometry';
import type { AttuneCommand, AttuneWorkspace, PanelGeometry } from './model';

export interface TransitionMetadata {
  readonly commandId: string;
  readonly now: string;
}

export interface DomainTransition {
  readonly workspace: AttuneWorkspace;
  readonly affectedEntities: readonly string[];
}

function assertNever(command: never): never {
  throw new TypeError(`Unsupported Attune command: ${JSON.stringify(command)}`);
}

function seedGeometry(): PanelGeometry {
  return {
    width: 218,
    height: 120,
    thickness: 3,
    material: 'acrylic',
    mounts: [
      { id: 'mount:top-left', center: { x: 20, y: 20 }, diameter: 6, locked: true },
      { id: 'mount:top-right', center: { x: 198, y: 20 }, diameter: 6, locked: true },
      { id: 'mount:bottom-left', center: { x: 20, y: 100 }, diameter: 6, locked: true },
      { id: 'mount:bottom-right', center: { x: 198, y: 100 }, diameter: 6, locked: true },
    ],
    auxiliaryHoles: [
      { id: 'hole:aux-left', center: { x: 80, y: 60 }, diameter: 8, locked: false },
      { id: 'hole:aux-right', center: { x: 138, y: 60 }, diameter: 8, locked: false },
    ],
    slot: {
      id: 'slot:connector',
      center: { x: 199.9, y: 60 },
      width: 20,
      height: 12,
      locked: false,
    },
    constraints: {
      requiredSlotClearance: 12,
      equalAuxiliaryHoles: true,
      symmetricAuxiliaryHoles: true,
    },
  };
}

export function createAt1042Workspace(): AttuneWorkspace {
  return {
    projectId: 'project:attune',
    commitmentId: 'AT-1042',
    workspaceSeq: 0,
    draftVersion: 6,
    capabilityEpoch: 1,
    fabricationQuantity: 4,
    geometry: seedGeometry(),
    quoteRequests: [],
    frozenRevisions: [],
    quotes: [],
    acceptances: [],
    commerceLinks: [],
  };
}

function advance(workspace: AttuneWorkspace, changes: Partial<AttuneWorkspace>): AttuneWorkspace {
  return {
    ...workspace,
    ...changes,
    workspaceSeq: workspace.workspaceSeq + 1,
    capabilityEpoch: workspace.capabilityEpoch + 1,
  };
}

function mutateDraft(workspace: AttuneWorkspace, geometry: PanelGeometry): AttuneWorkspace {
  return advance(workspace, {
    draftVersion: workspace.draftVersion + 1,
    geometry,
  });
}

function freezeAndQuote(workspace: AttuneWorkspace, metadata: TransitionMetadata): AttuneWorkspace {
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

  return advance(workspace, {
    frozenRevisions: [
      ...workspace.frozenRevisions,
      {
        revisionId,
        draftVersion: workspace.draftVersion,
        specHash,
        geometry: structuredClone(workspace.geometry),
        frozenAt: metadata.now,
      },
    ],
    quotes: [
      ...workspace.quotes,
      {
        quoteId: `quote:${metadata.commandId}`,
        revisionId,
        specHash,
        amountMinor: 240_000,
        currency: 'INR',
        panelCount: 4,
        commerceLotQuantity: 1,
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
    acceptances: [
      ...workspace.acceptances,
      {
        acceptanceId: `acceptance:${metadata.commandId}`,
        quoteId: quote.quoteId,
        revisionId: quote.revisionId,
        specHash: quote.specHash,
        acceptedAt: metadata.now,
      },
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
): DomainTransition {
  switch (command.type) {
    case 'apply_deterministic_repair':
      return {
        workspace: mutateDraft(
          workspace,
          applyRepairToGeometry(workspace.geometry, command.repairId),
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
    case 'request_quote':
      return {
        workspace: advance(workspace, {
          quoteRequests: [
            ...workspace.quoteRequests,
            {
              id: `quote-request:${metadata.commandId}`,
              draftVersion: workspace.draftVersion,
              specHash: hashSpecification(workspace),
              requestedAt: metadata.now,
            },
          ],
        }),
        affectedEntities: ['commitment:AT-1042'],
      };
    case 'freeze_and_quote_revision':
      return {
        workspace: freezeAndQuote(workspace, metadata),
        affectedEntities: [`revision:r${workspace.draftVersion}`, 'quote:current'],
      };
    case 'accept_revision':
      return {
        workspace: acceptRevision(workspace, command, metadata),
        affectedEntities: [`revision:${command.revisionId}`, command.quoteId],
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
  return validateGeometry(workspace.geometry);
}
