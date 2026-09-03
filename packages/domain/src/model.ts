import type { SketchCommand } from './sketch/commands';
import type { SketchDocument } from './sketch/document';

export type CommandOrigin =
  | 'human_ui'
  | 'webmcp'
  | 'system'
  | 'shopify_webhook'
  | 'shopify_reconciliation';

export type AttuneRole = 'buyer' | 'provider' | 'editor' | 'reviewer';

export interface CommerceAddress {
  readonly firstName: string;
  readonly lastName: string;
  readonly company?: string;
  readonly address1: string;
  readonly address2?: string;
  readonly city: string;
  readonly provinceCode?: string;
  readonly countryCode: string;
  readonly postalCode: string;
  readonly phone?: string;
}

export interface BuyerCommerceProfile {
  readonly principalId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone?: string;
  readonly shippingAddress: CommerceAddress;
  readonly billingSameAsShipping: boolean;
  readonly billingAddress?: CommerceAddress;
  readonly updatedAt: string;
}

export interface ShopifyCustomerBinding {
  readonly buyerPrincipalId: string;
  readonly shopDomain: string;
  readonly customerId: string;
  readonly defaultAddressId?: string;
  readonly synchronizedAt: string;
}

export type CapabilityLimit = number | 'ANY' | 'UNSPECIFIED';

export interface ManufacturingConfiguration {
  readonly material: PanelGeometry['material'];
  readonly thicknessMm: number;
  readonly finish: string;
  readonly quantity: number;
  readonly toleranceMm: number;
}

export interface ProviderCapabilityProfile {
  readonly profileId: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly source?: 'SHOPIFY_AND_ATTUNE' | 'DEMO';
  readonly marketplaceListed?: boolean;
  readonly shopify?: {
    readonly shopId: string;
    readonly shopDomain: string;
    readonly primaryDomain: string;
    readonly locationId: string;
    readonly locationName: string;
    readonly address: string;
    readonly city?: string;
    readonly province?: string;
    readonly country?: string;
    readonly latitude?: number;
    readonly longitude?: number;
    readonly currency: string;
    readonly verifiedAt: string;
  };
  readonly version: string;
  readonly processes: readonly {
    readonly id: string;
    readonly name: string;
    readonly machine: string;
    readonly workEnvelopeMm: {
      readonly width: CapabilityLimit;
      readonly height: CapabilityLimit;
      readonly thickness: CapabilityLimit;
    };
  }[];
  readonly materials:
    | readonly {
        readonly material: PanelGeometry['material'];
        readonly thicknessesMm: readonly number[] | 'ANY' | 'UNSPECIFIED';
      }[]
    | 'ANY'
    | 'UNSPECIFIED';
  readonly toleranceMm: CapabilityLimit;
  readonly minimums: {
    readonly featureMm: CapabilityLimit;
    readonly holeDiameterMm: CapabilityLimit;
    readonly slotWidthMm: CapabilityLimit;
    readonly edgeClearanceMm: CapabilityLimit;
    readonly spacingWebMm: CapabilityLimit;
    readonly toolRadiusMm: CapabilityLimit;
    readonly kerfMm: CapabilityLimit;
  };
  readonly topology: {
    readonly closedContour: boolean | 'UNSPECIFIED';
    readonly noSelfIntersection: boolean | 'UNSPECIFIED';
    readonly cutoutContainment: boolean | 'UNSPECIFIED';
    readonly noInvalidOverlap: boolean | 'UNSPECIFIED';
  };
  readonly supportedOperations: readonly string[] | 'ANY' | 'UNSPECIFIED';
  readonly surfaceFinish?: Readonly<Record<string, string>>;
  readonly finishes?: readonly string[];
  readonly leadTimeDays?: { readonly min: number; readonly max: number };
  readonly customRules: readonly {
    readonly id: string;
    readonly description: string;
    readonly limit: CapabilityLimit;
  }[];
  readonly effectiveAt: string;
}

export interface ProviderBinding {
  readonly providerId: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly shopDomain?: string;
  readonly shopifyLocationId?: string;
}

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
  readonly id: string;
  readonly center: PointMm;
  readonly width: number;
  readonly height: number;
  readonly locked: boolean;
}

export interface RectangularFeature {
  readonly id: string;
  readonly center: PointMm;
  readonly width: number;
  readonly height: number;
  readonly cornerRadius: number;
  readonly locked: boolean;
}

export interface PanelGeometry {
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  readonly material: 'acrylic' | 'aluminium';
  readonly mounts: readonly CircularFeature[];
  readonly auxiliaryHoles: readonly CircularFeature[];
  readonly slot: SlotFeature;
  readonly rectangularCutouts: readonly RectangularFeature[];
  readonly circularCutouts: readonly CircularFeature[];
  readonly ventSlots: readonly SlotFeature[];
  readonly constraints: {
    readonly requiredSlotClearance: number;
    readonly equalAuxiliaryHoles: boolean;
    readonly symmetricAuxiliaryHoles: boolean;
  };
}

export interface UniversalValidationIssue {
  readonly id: 'invalid_panel' | 'feature_outside_profile';
  readonly severity: 'hard';
  readonly source: 'universal';
  readonly message: string;
  readonly affectedEntities: readonly string[];
}

export interface ProviderValidationIssue {
  readonly id:
    | 'provider_work_envelope'
    | 'provider_material'
    | 'provider_thickness'
    | 'provider_hole_minimum'
    | 'provider_slot_minimum'
    | 'slot_clearance';
  readonly severity: 'hard';
  readonly source: 'provider';
  readonly message: string;
  readonly observedMm?: number;
  readonly requiredMm?: number;
  readonly affectedEntities: readonly string[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly (UniversalValidationIssue | ProviderValidationIssue)[];
  readonly universal: {
    readonly valid: boolean;
    readonly issues: readonly UniversalValidationIssue[];
  };
  readonly provider: {
    readonly valid: boolean;
    readonly providerId: string;
    readonly profileId: string;
    readonly profileVersion: string;
    readonly issues: readonly ProviderValidationIssue[];
  };
  readonly evidence: {
    readonly slotRightClearanceMm: number;
    readonly requiredSlotClearanceMm: number;
    readonly lockedMountsPreserved: number;
    readonly lockedMountsTotal: number;
    readonly providerId: string;
    readonly providerProfileVersion: string;
  };
}

export interface QuoteRequest {
  readonly id: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly draftVersion: number;
  readonly specHash: string;
  readonly specRevision: string;
  readonly provider: ProviderBinding;
  readonly requestedAt: string;
}

export type VersionPreviewStatus = 'PENDING' | 'STORED' | 'UNCONFIGURED' | 'FAILED';

export interface SavedDesignVersion {
  readonly versionId: string;
  readonly versionNumber: number;
  readonly name: string;
  readonly sourceDraftVersion: number;
  readonly specHash: string;
  readonly geometry: PanelGeometry;
  readonly sketchDocument: SketchDocument;
  readonly preview: {
    readonly key?: string;
    readonly status: VersionPreviewStatus;
    readonly storedAt?: string;
    readonly errorCode?: string;
  };
  readonly savedAt: string;
}

export interface FrozenRevision {
  readonly revisionId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly draftVersion: number;
  readonly specHash: string;
  readonly provider: ProviderBinding;
  readonly geometry: PanelGeometry;
  readonly sketchDocument: SketchDocument;
  readonly frozenAt: string;
}

export interface Quote {
  readonly quoteId: string;
  readonly requestId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly revisionId: string;
  readonly specHash: string;
  readonly provider: ProviderBinding;
  readonly amountMinor: number;
  readonly currency: string;
  readonly panelCount: number;
  readonly commerceLotQuantity: number;
  readonly leadTimeDays?: number;
  readonly validUntil?: string;
  readonly status: 'READY' | 'STALE' | 'SUPERSEDED' | 'ACCEPTED';
  readonly quotedAt: string;
}

export interface Acceptance {
  readonly acceptanceId: string;
  readonly requestId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly quoteId: string;
  readonly revisionId: string;
  readonly specHash: string;
  readonly provider: ProviderBinding;
  readonly acceptedAt: string;
}

export type DesignVisibility = 'PRIVATE' | 'DISCOVERABLE';

export type ManufacturingRequestStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'QUOTE_READY'
  | 'QUOTE_CHANGED'
  | 'CHECKOUT_READY'
  | 'ORDERED'
  | 'PROVIDER_REVIEW_REQUESTED'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'COMMERCE_READY'
  | 'EXTERNAL_DRIFT'
  | 'CHANGES_REQUESTED'
  | 'STALE'
  | 'SUPERSEDED';

export interface ManufacturingRequest {
  readonly requestId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly requestRevision: number;
  readonly supersedesRequestId?: string;
  readonly specRevision: string;
  readonly specHash: string;
  readonly provider: ProviderBinding;
  readonly visibility: DesignVisibility;
  readonly reviewAccess?: {
    readonly providerId: string;
    readonly versionId: string;
    readonly permission: 'VIEW_FROZEN_VERSION';
    readonly reason: 'Shared for manufacturing review';
    readonly grantedAt: string;
  };
  readonly configuration?: ManufacturingConfiguration;
  readonly providerProfileVersion?: string;
  readonly shopDomain?: string;
  readonly shopifyLocationId?: string;
  readonly buyerPrincipalId?: string;
  readonly status: ManufacturingRequestStatus;
  readonly requestedAt: string;
  readonly updatedAt: string;
}

export interface ChangeRequest {
  readonly changeRequestId: string;
  readonly requestId: string;
  readonly fromVersionId: string;
  readonly status: 'OPEN' | 'RESOLVED';
  readonly requestedBy: 'buyer' | 'provider';
  readonly note?: string;
  readonly createdAt: string;
}

export interface ExternalCommerceSnapshot {
  readonly externalId: string;
  readonly kind: 'SHOPIFY_DRAFT_ORDER';
  readonly status: string;
  readonly requestId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly specRevision: string;
  readonly specHash: string;
  readonly provider: ProviderBinding;
  readonly amountMinor: number;
  readonly currency: string;
  readonly customerId?: string;
  readonly name?: string;
  readonly invoiceUrl?: string;
  readonly updatedAt: string;
}

export interface ExternalCommerceRecord extends ExternalCommerceSnapshot {
  readonly syncState: 'IN_SYNC' | 'EXTERNAL_DRIFT';
  readonly synchronizedAt: string;
}

export interface CommerceVerification {
  readonly adminVerified: true;
  readonly publicationVerified: true;
  readonly storefrontVerified: true;
  readonly productId: string;
  readonly variantId: string;
  readonly publicationId: string;
  readonly storefrontUrl: string;
  readonly commitmentId: string;
  readonly revisionId: string;
  readonly specHash: string;
  readonly title: string;
  readonly sku: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly panelCount: number;
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
  readonly scenarioVersion: number;
  readonly projectId: string;
  readonly commitmentId: string;
  readonly workspaceSeq: number;
  readonly draftVersion: number;
  readonly capabilityEpoch: number;
  readonly authorityEpoch: number;
  readonly fabricationQuantity: number;
  readonly manufacturingConfiguration?: ManufacturingConfiguration;
  readonly providerCapabilityProfile: ProviderCapabilityProfile;
  readonly geometry: PanelGeometry;
  readonly sketchDocument: SketchDocument;
  readonly savedVersions: readonly SavedDesignVersion[];
  readonly quoteRequests: readonly QuoteRequest[];
  readonly frozenRevisions: readonly FrozenRevision[];
  readonly quotes: readonly Quote[];
  readonly acceptances: readonly Acceptance[];
  readonly manufacturingRequests: readonly ManufacturingRequest[];
  readonly changeRequests: readonly ChangeRequest[];
  readonly externalCommerceRecords: readonly ExternalCommerceRecord[];
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
  | SketchCommand
  | { readonly type: 'apply_deterministic_repair'; readonly repairId: DeterministicRepair['id'] }
  | { readonly type: 'move_slot'; readonly centerX: number; readonly centerY: number }
  | {
      readonly type: 'request_quote';
      readonly configuration?: ManufacturingConfiguration;
      readonly buyerPrincipalId?: string;
      readonly versionId?: string;
    }
  | { readonly type: 'save_design_version'; readonly name?: string }
  | {
      readonly type: 'set_version_preview';
      readonly versionId: string;
      readonly status: VersionPreviewStatus;
      readonly key?: string;
      readonly storedAt?: string;
      readonly errorCode?: string;
    }
  | {
      readonly type: 'request_changes';
      readonly requestId: string;
      readonly note?: string;
      readonly configuration?: ManufacturingConfiguration;
    }
  | {
      readonly type: 'freeze_and_quote_revision';
      readonly amountMinor?: number;
      readonly currency?: string;
      readonly leadTimeDays?: number;
      readonly validUntil?: string;
    }
  | {
      readonly type: 'synchronize_provider_profile';
      readonly profile: ProviderCapabilityProfile;
    }
  | { readonly type: 'accept_revision'; readonly revisionId: string; readonly quoteId: string }
  | {
      readonly type: 'synchronize_shopify_draft_order';
      readonly snapshot: ExternalCommerceSnapshot;
    }
  | {
      readonly type: 'materialize_for_commerce';
      readonly revisionId: string;
      readonly verification: CommerceVerification;
    };

export type AttuneCommandType = AttuneCommand['type'];
