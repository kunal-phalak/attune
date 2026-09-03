import { compareValidChanges } from '@attune/domain';

import {
  acceptanceBlockers,
  commerceBlockers,
  conflictBlockers,
  editBlockers,
  navigationBlockers,
  quoteBlockers,
  requestChangeBlockers,
  requestBlockers,
} from './blockers';
import type { CapabilityDefinition } from './types';

export const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
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
      'Resolves the selected hard geometry conflict while preserving locked requirements.',
      'Increments draft version and capability epoch.',
    ],
    blockers: conflictBlockers,
    reason: () => 'At least one predicted repair resolves the current hard conflict.',
  },
  {
    id: 'edit_draft',
    description: () => 'Edit semantic geometry in the current draft.',
    predictedConsequences: () => [
      'Increments draft version and capability epoch.',
      'Revokes authority tied to the previous specification.',
    ],
    blockers: editBlockers,
    reason: () => 'The current principal can edit this draft.',
  },
  {
    id: 'request_quote',
    description: () => 'Request a provider quote for the exact specification.',
    predictedConsequences: ({ authority }) => [`Binds the request to ${authority.specHash}.`],
    blockers: requestBlockers,
    reason: () => 'The current specification is buildable and has no current quote authority.',
  },
  {
    id: 'request_changes',
    description: () => 'Create a new exact-version revision of an existing manufacturing request.',
    predictedConsequences: () => [
      'Preserves the prior request and any accepted commitment.',
      'Creates a new immutable version for maker review.',
    ],
    blockers: requestChangeBlockers,
    reason: () => 'An existing manufacturing request can be revised by its buyer.',
  },
  {
    id: 'freeze_and_quote_revision',
    description: () => 'Freeze and quote the requested specification.',
    predictedConsequences: ({ authority }) => [
      `Creates immutable ${authority.revisionId}.`,
      'Commits the provider-entered price, lead time, and quote validity.',
    ],
    blockers: quoteBlockers,
    reason: () => 'A buyer request matches the exact current specification hash.',
  },
  {
    id: 'accept_revision',
    description: () => 'Accept the exact quoted frozen revision.',
    predictedConsequences: ({ authority }) => [
      `Accepts ${authority.revisionId} and its exact specification hash.`,
      'Accrues commerce preparation authority for the selected provider.',
    ],
    blockers: acceptanceBlockers,
    reason: () => 'The provider quote and immutable revision match the current specification.',
  },
  {
    id: 'materialize_for_commerce',
    description: () => 'Materialize the accepted revision in Shopify.',
    predictedConsequences: () => [
      'Requires exact Admin, publication, and Storefront verification.',
      'Creates one purchasable lot representing the accepted manufacturing configuration.',
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
