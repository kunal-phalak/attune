import { parseCommandExecutionInput } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { executeHumanCommand, inspectForHuman } from '../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export function GET() {
  return noStoreJson(inspectForHuman());
}

export async function POST(request: Request) {
  try {
    const input = parseCommandExecutionInput(await request.json(), [
      'apply_deterministic_repair',
      'move_slot',
      'request_quote',
      'accept_revision',
    ]);
    return noStoreJson(executeHumanCommand(input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
