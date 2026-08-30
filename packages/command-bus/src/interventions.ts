import type { ChangeReceipt, InterventionSummary } from './types';

export function interventionSummary(
  receipts: readonly ChangeReceipt[],
  cursor: number | undefined,
  currentWorkspaceSeq: number,
): InterventionSummary {
  const previousWorkspaceSeq = cursor ?? currentWorkspaceSeq;
  const interventions = receipts
    .filter((receipt) => receipt.receiptSeq > previousWorkspaceSeq && receipt.origin === 'human_ui')
    .map(({ receiptSeq, origin, command, affectedEntities, beforeHash, afterHash }) => ({
      receiptSeq,
      origin,
      command,
      affectedEntities,
      beforeHash,
      afterHash,
    }));

  return { previousWorkspaceSeq, currentWorkspaceSeq, interventions };
}
