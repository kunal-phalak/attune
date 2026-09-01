import type { CapabilityId } from '@attune/capabilities';
import type { AttuneWorkspace, SketchSolveStatus } from '@attune/domain';

export interface TopologySummary {
  readonly entityCount: number;
  readonly constraintCount: number;
  readonly dimensionCount: number;
  readonly groupCount: number;
}

export interface ForecastConsequence {
  readonly valid: boolean;
  readonly beforeHash: string;
  readonly afterHash: string;
  readonly changedEntities: readonly string[];
  readonly addedConstraints: readonly string[];
  readonly removedConstraints: readonly string[];
  readonly solver: {
    readonly status: SketchSolveStatus | 'not_applicable';
    readonly conflicts: readonly string[];
    readonly diagnostics: readonly string[];
    readonly degreesOfFreedomBefore: number | null;
    readonly degreesOfFreedomAfter: number | null;
  };
  readonly topologyBefore: TopologySummary;
  readonly topologyAfter: TopologySummary;
  readonly capabilitiesGained: readonly CapabilityId[];
  readonly capabilitiesLost: readonly CapabilityId[];
  readonly warnings: readonly string[];
}

export interface WorkspaceForecast {
  readonly consequence: ForecastConsequence;
  readonly workspaceAfter: AttuneWorkspace;
  readonly affectedEntities: readonly string[];
}
