import {
  parseDelegatedRole,
  parseForecastCommandInput,
  parseWorkspaceId,
} from '../../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../../lib/attune-response';
import { forecastAgentCommand } from '../../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams;
    const workspaceId = parseWorkspaceId(parameters.get('workspace_id'));
    const role = parseDelegatedRole(parameters.get('perspective'));
    const command = parseForecastCommandInput(await request.json(), [
      'create_geometry',
      'edit_geometry',
      'move_node',
      'delete_geometry',
      'create_group',
      'move_to_group',
      'apply_constraint',
      'remove_constraint',
      'set_dimension',
    ]);
    return noStoreJson(await forecastAgentCommand(workspaceId, role, command));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
