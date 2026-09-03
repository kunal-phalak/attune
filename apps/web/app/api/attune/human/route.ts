import { parseCommandExecutionInput, parseWorkspaceId } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import {
  executeHumanCommand,
  executeHumanSemanticCommand,
  inspectForCurrentHuman,
} from '../../../../lib/attune-runtime';
import { ServerTimingTrace } from '../../../../lib/server-timing';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const timing = new ServerTimingTrace();
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    return timing.apply(noStoreJson(await inspectForCurrentHuman(workspaceId, timing.record)));
  } catch (error) {
    return timing.apply(attuneErrorResponse(error));
  }
}

export async function POST(request: Request) {
  const timing = new ServerTimingTrace();
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    const input = parseCommandExecutionInput(await request.json(), [
      'instantiate_recipe',
      'update_recipe_parameters',
      'set_radius',
      'set_tangent',
      'apply_deterministic_repair',
      'move_slot',
      'save_design_version',
      'request_quote',
      'request_changes',
      'accept_revision',
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
    return timing.apply(
      noStoreJson(
        isSketchCommand(input.command)
          ? await executeHumanSemanticCommand(workspaceId, input, 'editor', timing.record)
          : await executeHumanCommand(
              workspaceId,
              input,
              input.command.type === 'save_design_version' ? 'editor' : 'buyer',
            ),
      ),
    );
  } catch (error) {
    return timing.apply(attuneErrorResponse(error));
  }
}
import { isSketchCommand } from '@attune/domain';
