import {
  parseCommandExecutionInput,
  parseMaterializationExecutionInput,
  parseObservationCursor,
} from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import {
  executeAgentCommand,
  executeCommerceMaterialization,
  inspectForAgent,
} from '../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  try {
    const cursor = parseObservationCursor(new URL(request.url).searchParams.get('cursor'));
    return noStoreJson(inspectForAgent(cursor));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const command =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'command') : undefined;
    const type =
      typeof command === 'object' && command !== null ? Reflect.get(command, 'type') : undefined;
    if (type === 'materialize_for_commerce') {
      return noStoreJson(
        await executeCommerceMaterialization(parseMaterializationExecutionInput(body)),
      );
    }
    const input = parseCommandExecutionInput(body, ['apply_deterministic_repair', 'move_slot']);
    return noStoreJson(executeAgentCommand(input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
