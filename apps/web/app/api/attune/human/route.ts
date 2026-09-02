import { parseCommandExecutionInput, parseWorkspaceId } from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import {
  executeHumanCommand,
  executeHumanSemanticCommand,
  inspectForHuman,
} from '../../../../lib/attune-runtime';
import { ServerTimingTrace } from '../../../../lib/server-timing';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const timing = new ServerTimingTrace();
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    return timing.apply(noStoreJson(await inspectForHuman(workspaceId, 'buyer', timing.record)));
  } catch (error) {
    return timing.apply(attuneErrorResponse(error));
  }
}

export async function POST(request: Request) {
  const timing = new ServerTimingTrace();
  try {
    const workspaceId = parseWorkspaceId(new URL(request.url).searchParams.get('workspace_id'));
    const input = parseCommandExecutionInput(await request.json(), [
      'apply_deterministic_repair',
      'move_slot',
      'request_quote',
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
          ? await executeHumanSemanticCommand(workspaceId, input, 'buyer', timing.record)
          : await executeHumanCommand(workspaceId, input),
      ),
    );
  } catch (error) {
    return timing.apply(attuneErrorResponse(error));
  }
}
import { isSketchCommand } from '@attune/domain';
