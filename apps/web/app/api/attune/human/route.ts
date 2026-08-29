import { parseRepairExecutionInput } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { executeHumanRepair, inspectForHuman } from '../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export function GET() {
  return noStoreJson(inspectForHuman());
}

export async function POST(request: Request) {
  try {
    const input = parseRepairExecutionInput(await request.json());
    return noStoreJson(executeHumanRepair(input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
