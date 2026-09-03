import {
  parseDelegatedRole,
  parseForecastCommandInput,
  parseWorkspaceId,
} from '../../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../../lib/attune-response';
import { forecastAgentCommand } from '../../../../../lib/attune-runtime';
import { ServerTimingTrace } from '../../../../../lib/server-timing';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const timing = new ServerTimingTrace();
  const startedAt = performance.now();
  try {
    const parameters = new URL(request.url).searchParams;
    const workspaceId = parseWorkspaceId(parameters.get('workspace_id'));
    const role = parseDelegatedRole(parameters.get('perspective'));
    const command = parseForecastCommandInput(await request.json(), [
      'instantiate_recipe',
      'update_recipe_parameters',
      'set_radius',
      'set_tangent',
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
    ]);
    const result = await forecastAgentCommand(workspaceId, role, command, timing.record);
    timing.record('total_server_execution', performance.now() - startedAt);
    return timing.apply(noStoreJson(result));
  } catch (error) {
    timing.record('total_server_execution', performance.now() - startedAt);
    return timing.apply(attuneErrorResponse(error));
  }
}
