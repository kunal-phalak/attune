import { parseObservationCursor, parseRepairExecutionInput } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { executeAgentRepair, inspectForAgent } from '../../../../lib/attune-runtime';

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
    const input = parseRepairExecutionInput(await request.json());
    return noStoreJson(executeAgentRepair(input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
