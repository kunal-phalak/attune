import { isSketchCommand } from '@attune/domain';

import {
  parseAgentContextFocus,
  parseCommandExecutionInput,
  parseDelegatedRole,
  parseMaterializationExecutionInput,
  parseWorkspaceId,
} from '../../../../lib/attune-request';
import { attuneErrorResponse, noStoreJson } from '../../../../lib/attune-response';
import {
  executeAgentCommand,
  executeAgentSemanticCommand,
  executeCommerceMaterialization,
  inspectAgentContext,
  inspectForDelegatedAgent,
} from '../../../../lib/attune-runtime';
import { ServerTimingTrace } from '../../../../lib/server-timing';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const timing = new ServerTimingTrace();
  const startedAt = performance.now();
  try {
    const parameters = new URL(request.url).searchParams;
    const role = parseDelegatedRole(parameters.get('perspective'));
    const workspaceId = parseWorkspaceId(parameters.get('workspace_id'));
    if (parameters.get('format') === 'context') {
      const context = await inspectAgentContext(
        workspaceId,
        role,
        parseAgentContextFocus(parameters),
        timing.record,
      );
      timing.record('total_server_execution', performance.now() - startedAt);
      return timing.apply(noStoreJson(context));
    }
    const view = await inspectForDelegatedAgent(workspaceId, role);
    timing.record('total_server_execution', performance.now() - startedAt);
    return timing.apply(noStoreJson(view));
  } catch (error) {
    timing.record('total_server_execution', performance.now() - startedAt);
    return timing.apply(attuneErrorResponse(error));
  }
}

export async function POST(request: Request) {
  const timing = new ServerTimingTrace();
  const startedAt = performance.now();
  try {
    const parameters = new URL(request.url).searchParams;
    const workspaceId = parseWorkspaceId(parameters.get('workspace_id'));
    const role = parseDelegatedRole(parameters.get('perspective'));
    const body: unknown = await request.json();
    const command =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'command') : undefined;
    const type =
      typeof command === 'object' && command !== null ? Reflect.get(command, 'type') : undefined;
    if (type === 'materialize_for_commerce') {
      if (role !== 'provider') throw new TypeError('Provider delegation required.');
      return noStoreJson(
        await executeCommerceMaterialization(
          workspaceId,
          role,
          parseMaterializationExecutionInput(body),
        ),
      );
    }
    const input = parseCommandExecutionInput(body, [
      'instantiate_recipe',
      'update_recipe_parameters',
      'set_radius',
      'set_tangent',
      'apply_deterministic_repair',
      'move_slot',
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
      'request_quote',
      'request_changes',
      'accept_revision',
    ]);
    const result = isSketchCommand(input.command)
      ? await executeAgentSemanticCommand(workspaceId, role, input, timing.record)
      : await executeAgentCommand(workspaceId, role, input);
    timing.record('total_server_execution', performance.now() - startedAt);
    return timing.apply(noStoreJson(result));
  } catch (error) {
    timing.record('total_server_execution', performance.now() - startedAt);
    return timing.apply(attuneErrorResponse(error));
  }
}
