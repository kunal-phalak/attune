import { parseCommandExecutionInput, parseWorkspaceId } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { executeHumanCommand, inspectForHuman } from '../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    return noStoreJson(await inspectForHuman(workspaceId));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    const input = parseCommandExecutionInput(await request.json(), [
      'apply_deterministic_repair',
      'move_slot',
      'request_quote',
      'accept_revision',
    ]);
    return noStoreJson(await executeHumanCommand(workspaceId, input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
