import { parseDelegatedRole, parseWorkspaceId } from '../../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../../lib/attune-response';
import { disableAgentAccess, enableAgentAccess } from '../../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

function requestContext(request: Request) {
  const parameters = new URL(request.url).searchParams;
  return {
    workspaceId: parseWorkspaceId(parameters.get('workspace_id')),
    perspective: parseDelegatedRole(parameters.get('perspective')),
  };
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      Reflect.get(body, 'consent') !== true ||
      Object.keys(body).some((key) => key !== 'consent')
    ) {
      throw new TypeError('Explicit agent-access consent is required.');
    }
    const { workspaceId, perspective } = requestContext(request);
    return noStoreJson(await enableAgentAccess(workspaceId, perspective));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { workspaceId, perspective } = requestContext(request);
    return noStoreJson(await disableAgentAccess(workspaceId, perspective));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
