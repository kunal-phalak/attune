import { compileCapabilities } from '@attune/capabilities';
import {
  applySketchCommand,
  hashCanonical,
  isSketchCommand,
  transitionWorkspace,
  validateWorkspace,
  type AttuneCommand,
  type AttuneRole,
  type AttuneWorkspace,
  type ConstraintSolver,
  type GeometryEntity,
  type SketchDocument,
  type TransitionMetadata,
} from '@attune/domain';

import { cacheForecast, cachedForecast, semanticForecastKey } from './cache';
import type { TopologySummary, WorkspaceForecast } from './consequence';

function topology(workspace: AttuneWorkspace): TopologySummary {
  const document = workspace.sketchDocument;
  return {
    entityCount: document.entities.length,
    constraintCount: document.constraints.length,
    dimensionCount: document.dimensions.length,
    groupCount: document.groups.length,
  };
}

function entityShape(entity: GeometryEntity): unknown {
  const { version: _version, ...shape } = entity;
  return shape;
}

function normalizeSolvedVersions(before: SketchDocument, solved: SketchDocument): SketchDocument {
  const previous = new Map(before.entities.map((entity) => [entity.id, entity]));
  const previousNodes = new Map((before.nodes ?? []).map((node) => [node.id, node]));
  return {
    ...solved,
    nodes: (solved.nodes ?? []).map((node) => {
      const prior = previousNodes.get(node.id);
      if (!prior) return Object.assign({}, node, { version: 1 });
      const changed = hashCanonical(prior.position) !== hashCanonical(node.position);
      return Object.assign({}, node, {
        version: changed ? Math.max(node.version, prior.version + 1) : node.version,
      });
    }),
    entities: solved.entities.map((entity) => {
      const prior = previous.get(entity.id);
      if (!prior) return { ...entity, version: 1 };
      const geometryChanged =
        hashCanonical(entityShape(prior)) !== hashCanonical(entityShape(entity));
      return {
        ...entity,
        version: geometryChanged ? Math.max(entity.version, prior.version + 1) : entity.version,
      };
    }),
  };
}

function changedEntityIds(before: SketchDocument, after: SketchDocument): readonly string[] {
  const beforeById = new Map(before.entities.map((entity) => [entity.id, entity]));
  const afterById = new Map(after.entities.map((entity) => [entity.id, entity]));
  return [...new Set([...beforeById.keys(), ...afterById.keys()])]
    .filter(
      (id) =>
        hashCanonical(beforeById.get(id) ?? null) !== hashCanonical(afterById.get(id) ?? null),
    )
    .toSorted();
}

function capabilityDiff(before: AttuneWorkspace, after: AttuneWorkspace, role: AttuneRole) {
  const beforeIds = new Set(compileCapabilities(before, role).map(({ id }) => id));
  const afterIds = new Set(compileCapabilities(after, role).map(({ id }) => id));
  return {
    gained: [...afterIds].filter((id) => !beforeIds.has(id)).toSorted(),
    lost: [...beforeIds].filter((id) => !afterIds.has(id)).toSorted(),
  };
}

function computeWorkspaceForecast(input: {
  readonly workspace: AttuneWorkspace;
  readonly command: AttuneCommand;
  readonly role: AttuneRole;
  readonly metadata: TransitionMetadata;
  readonly solver?: ConstraintSolver;
}): WorkspaceForecast {
  const before = structuredClone(input.workspace);
  const beforeHash = hashCanonical(before);
  let workspaceAfter: AttuneWorkspace;
  let affectedEntities: readonly string[];
  let addedConstraints: readonly string[] = [];
  let removedConstraints: readonly string[] = [];
  let solverStatus: WorkspaceForecast['consequence']['solver']['status'] = 'not_applicable';
  let solverConflicts: readonly string[] = [];
  let solverDiagnostics: readonly string[] = [];
  let degreesOfFreedomAfter = before.sketchDocument.lastSolve?.degreesOfFreedom ?? null;

  if (isSketchCommand(input.command)) {
    if (!input.solver) throw new TypeError('A ConstraintSolver is required for sketch commands.');
    const application = applySketchCommand(before.sketchDocument, input.command);
    const solution = input.solver.solve(application.document);
    const solvedDocument = normalizeSolvedVersions(before.sketchDocument, solution.document);
    const transition = transitionWorkspace(before, input.command, input.metadata, {
      solvedSketchDocument: solvedDocument,
    });
    workspaceAfter = transition.workspace;
    affectedEntities = [
      ...new Set([
        ...transition.affectedEntities,
        ...changedEntityIds(before.sketchDocument, workspaceAfter.sketchDocument),
      ]),
    ].toSorted();
    addedConstraints = application.addedConstraints;
    removedConstraints = application.removedConstraints;
    solverStatus = solution.status;
    solverConflicts = solution.conflicts;
    solverDiagnostics = solution.diagnostics.map(({ message }) => message);
    degreesOfFreedomAfter = solution.degreesOfFreedom;
  } else {
    const transition = transitionWorkspace(before, input.command, input.metadata);
    workspaceAfter = transition.workspace;
    affectedEntities = transition.affectedEntities;
  }

  const capabilities = capabilityDiff(before, workspaceAfter, input.role);
  const semanticSolverValid =
    solverStatus === 'not_applicable' ||
    ((solverStatus === 'success' || solverStatus === 'converged') &&
      solverConflicts.length === 0 &&
      solverDiagnostics.length === 0);
  const providerValidation = validateWorkspace(workspaceAfter);
  const warnings = isSketchCommand(input.command)
    ? providerValidation.valid
      ? []
      : [
          'The existing provider panel projection remains invalid; it is not yet derived from this semantic spoke sketch.',
        ]
    : providerValidation.valid
      ? []
      : providerValidation.issues.map(({ message }) => message);

  return {
    consequence: {
      valid: isSketchCommand(input.command) ? semanticSolverValid : providerValidation.valid,
      beforeHash,
      afterHash: hashCanonical(workspaceAfter),
      changedEntities: affectedEntities,
      addedConstraints,
      removedConstraints,
      solver: {
        status: solverStatus,
        conflicts: solverConflicts,
        diagnostics: solverDiagnostics,
        degreesOfFreedomBefore: before.sketchDocument.lastSolve?.degreesOfFreedom ?? null,
        degreesOfFreedomAfter,
      },
      topologyBefore: topology(before),
      topologyAfter: topology(workspaceAfter),
      capabilitiesGained: capabilities.gained,
      capabilitiesLost: capabilities.lost,
      warnings,
    },
    workspaceAfter,
    affectedEntities,
  };
}

export function forecastWorkspaceChange(input: {
  readonly workspace: AttuneWorkspace;
  readonly command: AttuneCommand;
  readonly role: AttuneRole;
  readonly metadata: TransitionMetadata;
  readonly solver?: ConstraintSolver;
}): WorkspaceForecast {
  if (!isSketchCommand(input.command)) return computeWorkspaceForecast(input);
  const key = semanticForecastKey(input);
  return cachedForecast(key) ?? cacheForecast(key, computeWorkspaceForecast(input));
}
