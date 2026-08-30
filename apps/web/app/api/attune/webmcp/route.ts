import {
  parseCommandExecutionInput,
  parseMaterializationExecutionInput,
  parseObservationCursor,
  parseWorkspaceId,
} from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import {
  executeAgentCommand,
  executeCommerceMaterialization,
  inspectForAgent,
} from '../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams;
    const cursor = parseObservationCursor(parameters.get('cursor'));
    const workspaceId = parseWorkspaceId(parameters.get('workspace_id'));
    return noStoreJson(await inspectForAgent(workspaceId, cursor));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    const body: unknown = await request.json();
    const command =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'command') : undefined;
    const type =
      typeof command === 'object' && command !== null ? Reflect.get(command, 'type') : undefined;
    if (type === 'materialize_for_commerce') {
      return noStoreJson(
        await executeCommerceMaterialization(workspaceId, parseMaterializationExecutionInput(body)),
      );
    }
    const input = parseCommandExecutionInput(body, ['apply_deterministic_repair', 'move_slot']);
    return noStoreJson(await executeAgentCommand(workspaceId, input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
