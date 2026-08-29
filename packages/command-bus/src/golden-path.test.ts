import { compileCapabilities } from '@attune/capabilities';
import { createAt1042Workspace, type CommerceVerification } from '@attune/domain';
import { describe, expect, it } from 'vitest';

import {
  AttuneCommandBus,
  AttuneCommandError,
  type CommandEnvelope,
  type TrustedExecutionContext,
} from './index';

const FIXED_TIME = '2026-08-29T12:00:00.000Z';

const buyer: TrustedExecutionContext = {
  path: 'human',
  principalId: 'buyer:AT-1042',
  role: 'buyer',
};
const agent: TrustedExecutionContext = {
  path: 'webmcp',
  principalId: 'agent:judge-tab',
  role: 'agent',
};
const provider: TrustedExecutionContext = {
  path: 'provider',
  principalId: 'provider:fabricator',
  role: 'provider',
};
const shopify: TrustedExecutionContext = {
  path: 'shopify',
  principalId: 'integration:shopify',
  role: 'agent',
};

const commerceVerification: CommerceVerification = {
  adminVerified: true,
  publicationVerified: true,
  storefrontVerified: true,
  productId: 'gid://shopify/Product/AT1042R7',
  variantId: 'gid://shopify/ProductVariant/AT1042R7LOT4',
  publicationId: 'gid://shopify/Publication/online-store',
  storefrontUrl: 'https://attune-demo.myshopify.com/products/at-1042-r7',
  title: 'Custom Equipment Panel — AT-1042 r7',
  sku: 'AT-1042-R7-LOT4',
  amountMinor: 240_000,
  currency: 'INR',
  panelCount: 4,
  verifiedAt: FIXED_TIME,
};

function envelope(
  bus: AttuneCommandBus,
  commandId: string,
  observationCursor?: number,
): CommandEnvelope {
  const { workspace } = bus.inspect('agent');
  return {
    commandId,
    expectedWorkspaceSeq: workspace.workspaceSeq,
    expectedCapabilityEpoch: workspace.capabilityEpoch,
    observationCursor,
  };
}

function capabilityIds(bus: AttuneCommandBus, role: TrustedExecutionContext['role']) {
  return bus.inspect(role).capabilities.map((candidate) => candidate.id);
}

function runThroughAcceptance(bus: AttuneCommandBus) {
  bus.execute(
    { type: 'apply_deterministic_repair', repairId: 'move_slot_left_to_clearance' },
    envelope(bus, 'repair-r7'),
    agent,
  );
  bus.execute({ type: 'request_quote' }, envelope(bus, 'request-r7'), buyer);
  bus.execute({ type: 'freeze_and_quote_revision' }, envelope(bus, 'quote-r7'), provider);
  const quote = bus.inspect('buyer').workspace.quotes[0];
  bus.execute(
    { type: 'accept_revision', revisionId: quote.revisionId, quoteId: quote.quoteId },
    envelope(bus, 'accept-r7'),
    buyer,
  );
}

describe('shared Attune semantic command bus', () => {
  it('produces equivalent authoritative state for the same human and WebMCP repair', () => {
    const humanBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    const agentBus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    const command = {
      type: 'apply_deterministic_repair' as const,
      repairId: 'move_slot_left_to_clearance' as const,
    };

    const humanResult = humanBus.execute(command, envelope(humanBus, 'same-command'), buyer);
    const agentResult = agentBus.execute(command, envelope(agentBus, 'same-command'), agent);

    expect(humanResult.receipt.afterHash).toBe(agentResult.receipt.afterHash);
    expect(humanResult.receipt.origin).toBe('human_ui');
    expect(agentResult.receipt.origin).toBe('webmcp');
    expect(humanResult.receipt.validationAfter.valid).toBe(true);
    expect(agentResult.receipt.preservedLocks).toHaveLength(4);
  });

  it('automatically reports unseen human intervention to the agent', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    bus.execute(
      { type: 'move_slot', centerX: 196, centerY: 60 },
      envelope(bus, 'human-move'),
      buyer,
    );

    const observed = bus.inspect('agent', 0);
    expect(observed.observation).toEqual(
      expect.objectContaining({
        previousWorkspaceSeq: 0,
        currentWorkspaceSeq: 1,
        interventions: [
          expect.objectContaining({
            receiptSeq: 1,
            origin: 'human_ui',
            command: 'move_slot',
            affectedEntities: ['slot:connector'],
          }),
        ],
      }),
    );
  });

  it('makes command retries idempotent and rejects stale or forged authority', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    const request = envelope(bus, 'idempotent-repair');
    const command = {
      type: 'apply_deterministic_repair' as const,
      repairId: 'move_slot_left_to_clearance' as const,
    };
    const first = bus.execute(command, request, agent);
    const second = bus.execute(command, request, agent);

    expect(second).toBe(first);
    expect(bus.receipts()).toHaveLength(1);
    expect(() =>
      bus.execute({ type: 'request_quote' }, { ...request, commandId: 'stale-request' }, buyer),
    ).toThrowError(expect.objectContaining({ code: 'STALE_WORKSPACE' }));
    expect(() =>
      bus.execute({ type: 'request_quote' }, envelope(bus, 'forged-role'), {
        path: 'webmcp',
        principalId: 'browser-claim',
        role: 'buyer',
      }),
    ).toThrowError(expect.objectContaining({ code: 'ROLE_MISMATCH' }));
  });
});

describe('AT-1042 r7 to r8 authority path', () => {
  it('freezes, accepts and materializes exact r7, then revokes current commerce authority at r8', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    expect(capabilityIds(bus, 'agent')).toContain('apply_deterministic_repair');

    runThroughAcceptance(bus);
    const accepted = bus.inspect('agent');
    expect(accepted.workspace.draftVersion).toBe(7);
    expect(capabilityIds(bus, 'agent')).toContain('materialize_for_commerce');

    const materializeEnvelope = envelope(bus, 'materialize-r7');
    bus.execute(
      { type: 'materialize_for_commerce', revisionId: 'r7', verification: commerceVerification },
      materializeEnvelope,
      shopify,
    );
    const materialized = bus.inspect('buyer').workspace;
    const frozenR7 = structuredClone(materialized.frozenRevisions[0]);
    expect(materialized.commerceLinks[0]).toEqual(
      expect.objectContaining({
        revisionId: 'r7',
        specHash: frozenR7.specHash,
        status: 'VERIFIED',
      }),
    );
    expect(compileCapabilities(materialized, 'agent').map(({ id }) => id)).toContain(
      'navigate_to_storefront',
    );

    const staleEpoch = materialized.capabilityEpoch;
    bus.execute({ type: 'move_slot', centerX: 195, centerY: 60 }, envelope(bus, 'human-r8'), buyer);
    const r8 = bus.inspect('agent').workspace;
    const r8Capabilities = compileCapabilities(r8, 'agent').map(({ id }) => id);

    expect(r8.draftVersion).toBe(8);
    expect(r8.frozenRevisions[0]).toEqual(frozenR7);
    expect(r8.commerceLinks[0].revisionId).toBe('r7');
    expect(r8.quotes.some((quote) => quote.revisionId === 'r8')).toBe(false);
    expect(r8Capabilities).not.toContain('materialize_for_commerce');
    expect(r8Capabilities).not.toContain('navigate_to_storefront');
    expect(() =>
      bus.execute(
        { type: 'materialize_for_commerce', revisionId: 'r7', verification: commerceVerification },
        {
          commandId: 'stale-materialize',
          expectedWorkspaceSeq: r8.workspaceSeq,
          expectedCapabilityEpoch: staleEpoch,
        },
        shopify,
      ),
    ).toThrowError(AttuneCommandError);
    expect(() =>
      bus.execute(
        { type: 'materialize_for_commerce', revisionId: 'r7', verification: commerceVerification },
        envelope(bus, 'revalidated-materialize'),
        shopify,
      ),
    ).toThrowError(expect.objectContaining({ code: 'CAPABILITY_UNAVAILABLE' }));
  });

  it('emits immutable provenance, hashes, versions, epochs and lock evidence on every transition', () => {
    const bus = new AttuneCommandBus(createAt1042Workspace(), () => FIXED_TIME);
    runThroughAcceptance(bus);

    const receipts = bus.receipts();
    expect(receipts).toHaveLength(4);
    expect(receipts.map(({ receiptSeq }) => receiptSeq)).toEqual([1, 2, 3, 4]);
    expect(receipts.map(({ origin }) => origin)).toEqual([
      'webmcp',
      'human_ui',
      'provider',
      'human_ui',
    ]);
    expect(receipts.every(({ beforeHash, afterHash }) => beforeHash !== afterHash)).toBe(true);
    expect(receipts.every(({ preservedLocks }) => preservedLocks.length === 4)).toBe(true);
    expect(receipts.at(-1)).toEqual(
      expect.objectContaining({ workspaceSeq: 4, draftVersion: 7, capabilityEpoch: 5 }),
    );
    expect(Object.isFrozen(receipts[0])).toBe(true);
    expect(Object.isFrozen(receipts[0].validationAfter)).toBe(true);
  });
});
