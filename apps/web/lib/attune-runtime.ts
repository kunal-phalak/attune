import {
  AttuneCommandBus,
  AttuneCommandError,
  type CommandEnvelope,
  type TrustedExecutionContext,
} from '@attune/command-bus';
import {
  compareValidChanges,
  createAt1042Workspace,
  type AttuneCommand,
  type DeterministicRepair,
} from '@attune/domain';

const agentContext: TrustedExecutionContext = {
  path: 'webmcp',
  principalId: 'agent:webmcp-session',
  role: 'agent',
};

const humanContext: TrustedExecutionContext = {
  path: 'human',
  principalId: 'buyer:browser-session',
  role: 'buyer',
};

interface RuntimeGlobal {
  attuneAt1042Bus?: AttuneCommandBus;
}

export interface RepairExecutionInput {
  readonly repairId: DeterministicRepair['id'];
  readonly commandId: string;
  readonly expectedWorkspaceSeq: number;
  readonly expectedCapabilityEpoch: number;
  readonly observationCursor?: number;
}

function runtimeGlobal(): typeof globalThis & RuntimeGlobal {
  return globalThis;
}

export function getAt1042CommandBus(): AttuneCommandBus {
  const root = runtimeGlobal();
  root.attuneAt1042Bus ??= new AttuneCommandBus(createAt1042Workspace());
  return root.attuneAt1042Bus;
}

function viewFor(role: TrustedExecutionContext['role'], observationCursor?: number) {
  const bus = getAt1042CommandBus();
  const inspection = bus.inspect(role, observationCursor);
  return {
    ...inspection,
    repairs: compareValidChanges(inspection.workspace),
    receiptCount: bus.receipts().length,
  };
}

export function inspectForAgent(observationCursor?: number) {
  return viewFor('agent', observationCursor);
}

export function inspectForHuman() {
  return viewFor('buyer');
}

function repairCommand(input: RepairExecutionInput): {
  command: AttuneCommand;
  envelope: CommandEnvelope;
} {
  return {
    command: { type: 'apply_deterministic_repair', repairId: input.repairId },
    envelope: {
      commandId: input.commandId,
      expectedWorkspaceSeq: input.expectedWorkspaceSeq,
      expectedCapabilityEpoch: input.expectedCapabilityEpoch,
      observationCursor: input.observationCursor,
    },
  };
}

function executeRepair(input: RepairExecutionInput, context: TrustedExecutionContext) {
  const bus = getAt1042CommandBus();
  const request = repairCommand(input);
  const result = bus.execute(request.command, request.envelope, context);
  return {
    ...result,
    validation: result.receipt.validationAfter,
    repairs: compareValidChanges(result.workspace),
    receiptCount: bus.receipts().length,
  };
}

export function executeAgentRepair(input: RepairExecutionInput) {
  return executeRepair(input, agentContext);
}

export function executeHumanRepair(input: RepairExecutionInput) {
  return executeRepair(input, humanContext);
}

export function isAttuneCommandError(error: unknown): error is AttuneCommandError {
  return error instanceof AttuneCommandError;
}
