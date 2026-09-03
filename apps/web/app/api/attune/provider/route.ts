import { parseCommandExecutionInput, parseWorkspaceId } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import { finalizeProviderQuote, inspectForProvider } from '../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    return noStoreJson(await inspectForProvider(workspaceId));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    const input = parseCommandExecutionInput(await request.json(), ['freeze_and_quote_revision']);
    return noStoreJson(await finalizeProviderQuote(workspaceId, input));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
