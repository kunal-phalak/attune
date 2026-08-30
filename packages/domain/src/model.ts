export type CommandOrigin = 'human_ui' | 'webmcp' | 'solver' | 'provider' | 'shopify_verification';

export type AttuneRole = 'buyer' | 'provider' | 'agent';

export interface PointMm {
  readonly x: number;
  readonly y: number;
}

export interface CircularFeature {
  readonly id: string;
  readonly center: PointMm;
  readonly diameter: number;
  readonly locked: boolean;
}

export interface SlotFeature {
  readonly id: 'slot:connector';
  readonly center: PointMm;
  readonly width: number;
  readonly height: number;
  readonly locked: boolean;
}

export interface PanelGeometry {
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  readonly material: 'acrylic';
  readonly mounts: readonly CircularFeature[];
  readonly auxiliaryHoles: readonly CircularFeature[];
  readonly slot: SlotFeature;
  readonly constraints: {
    readonly requiredSlotClearance: number;
    readonly equalAuxiliaryHoles: boolean;
    readonly symmetricAuxiliaryHoles: boolean;
  };
}

export interface ValidationIssue {
  readonly id: 'slot_clearance';
  readonly severity: 'hard';
  readonly message: string;
  readonly observedMm: number;
  readonly requiredMm: number;
  readonly affectedEntities: readonly string[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly evidence: {
    readonly slotRightClearanceMm: number;
    readonly requiredSlotClearanceMm: number;
    readonly lockedMountsPreserved: number;
    readonly lockedMountsTotal: number;
  };
}

export interface QuoteRequest {
  readonly id: string;
  readonly draftVersion: number;
  readonly specHash: string;
  readonly requestedAt: string;
}

export interface FrozenRevision {
  readonly revisionId: string;
  readonly draftVersion: number;
  readonly specHash: string;
  readonly geometry: PanelGeometry;
  readonly frozenAt: string;
}

export interface Quote {
  readonly quoteId: string;
  readonly revisionId: string;
  readonly specHash: string;
  readonly amountMinor: 240_000;
  readonly currency: 'INR';
  readonly panelCount: 4;
  readonly commerceLotQuantity: 1;
  readonly quotedAt: string;
}

export interface Acceptance {
  readonly acceptanceId: string;
  readonly quoteId: string;
  readonly revisionId: string;
  readonly specHash: string;
  readonly acceptedAt: string;
}

export interface CommerceVerification {
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
  readonly title: 'Custom Equipment Panel — AT-1042 r7';
  readonly sku: 'AT-1042-R7-LOT4';
  readonly amountMinor: 240_000;
  readonly currency: 'INR';
  readonly panelCount: 4;
  readonly verifiedAt: string;
}

export interface CommerceLink {
  readonly commerceLinkId: string;
  readonly revisionId: string;
  readonly specHash: string;
  readonly status: 'VERIFIED';
  readonly verification: CommerceVerification;
}

export interface AttuneWorkspace {
  readonly projectId: 'project:attune';
  readonly commitmentId: 'AT-1042';
  readonly workspaceSeq: number;
  readonly draftVersion: number;
  readonly capabilityEpoch: number;
  readonly fabricationQuantity: 4;
  readonly geometry: PanelGeometry;
  readonly quoteRequests: readonly QuoteRequest[];
  readonly frozenRevisions: readonly FrozenRevision[];
  readonly quotes: readonly Quote[];
  readonly acceptances: readonly Acceptance[];
  readonly commerceLinks: readonly CommerceLink[];
}

export interface DeterministicRepair {
  readonly id: 'move_slot_left_to_clearance' | 'narrow_slot_to_clearance';
  readonly label: string;
  readonly affectedEntities: readonly ['slot:connector'];
  readonly resolvedIssues: readonly ['slot_clearance'];
  readonly predictedClearanceMm: 12;
  readonly predictedSpecHash: string;
  readonly preservedLockedEntities: readonly string[];
}

export type AttuneCommand =
  | { readonly type: 'apply_deterministic_repair'; readonly repairId: DeterministicRepair['id'] }
  | { readonly type: 'move_slot'; readonly centerX: number; readonly centerY: number }
  | { readonly type: 'request_quote' }
  | { readonly type: 'freeze_and_quote_revision' }
  | { readonly type: 'accept_revision'; readonly revisionId: string; readonly quoteId: string }
  | {
      readonly type: 'materialize_for_commerce';
      readonly revisionId: string;
      readonly verification: CommerceVerification;
    };

export type AttuneCommandType = AttuneCommand['type'];
