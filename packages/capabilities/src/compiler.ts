import {
  validateWorkspace,
  type AttuneCommandType,
  type AttuneRole,
  type AttuneWorkspace,
} from '@attune/domain';

import { deriveCurrentAuthority } from './authority';
import { CAPABILITY_DEFINITIONS } from './definitions';
import type {
  CapabilityDefinition,
  CapabilityFrontierEntry,
  CapabilityId,
  CompiledCapability,
  CompilerContext,
} from './types';

const COMMAND_CAPABILITY: Readonly<Partial<Record<AttuneCommandType, CapabilityId>>> = {
  apply_deterministic_repair: 'apply_deterministic_repair',
  move_slot: 'edit_draft',
  request_quote: 'request_quote',
  freeze_and_quote_revision: 'freeze_and_quote_revision',
  accept_revision: 'accept_revision',
  materialize_for_commerce: 'materialize_for_commerce',
};

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
  return CAPABILITY_DEFINITIONS.map((definition) => compileEntry(workspace, definition, context));
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
