import {
  parseCommandExecutionInput,
  parseDelegatedRole,
  parseMaterializationExecutionInput,
  parseObservationCursor,
  parseWorkspaceId,
} from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import {
  executeAgentCommand,
  executeCommerceMaterialization,
  inspectForDelegatedAgent,
} from '../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams;
    const cursor = parseObservationCursor(parameters.get('cursor'));
    const role = parseDelegatedRole(parameters.get('perspective'));
    const workspaceId = parseWorkspaceId(parameters.get('workspace_id'));
    return noStoreJson(await inspectForDelegatedAgent(workspaceId, role, cursor));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams;
    const workspaceId = parseWorkspaceId(parameters.get('workspace_id'));
    const role = parseDelegatedRole(parameters.get('perspective'));
    const body: unknown = await request.json();
    const command =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'command') : undefined;
    const type =
      typeof command === 'object' && command !== null ? Reflect.get(command, 'type') : undefined;
    if (type === 'materialize_for_commerce') {
      if (role !== 'provider') throw new TypeError('Provider delegation required.');
      return noStoreJson(
        await executeCommerceMaterialization(
          workspaceId,
          role,
          parseMaterializationExecutionInput(body),
        ),
      );
    }
    const input = parseCommandExecutionInput(body, ['apply_deterministic_repair', 'move_slot']);
    return noStoreJson(await executeAgentCommand(workspaceId, role, input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
