import { parseForecastCommandInput, parseWorkspaceId } from '../../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../../lib/attune-response';
import { forecastHumanCommand } from '../../../../../lib/attune-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    const command = parseForecastCommandInput(await request.json(), [
      'create_geometry',
      'edit_geometry',
      'move_node',
      'transform_geometry',
      'trim_geometry',
      'delete_geometry',
      'set_construction',
      'create_group',
      'rename_group',
      'move_to_group',
      'apply_constraint',
      'remove_constraint',
      'set_dimension',
      'remove_dimension',
      'restore_sketch',
    ]);
    return noStoreJson(await forecastHumanCommand(workspaceId, command));
  } catch (error) {
    return attuneErrorResponse(error);
  }
}
