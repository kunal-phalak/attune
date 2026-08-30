import { parseCommandExecutionInput } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { executeProviderCommand, inspectForProvider } from '../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export function GET() {
  return noStoreJson(inspectForProvider());
}

export async function POST(request: Request) {
  try {
    const input = parseCommandExecutionInput(await request.json(), ['freeze_and_quote_revision']);
    return noStoreJson(executeProviderCommand(input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
