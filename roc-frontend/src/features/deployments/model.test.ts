import { describe, expect, it } from 'vitest';
import { deploymentTerminal, parseDeploymentResponse, retryableVehicleIds, stateLabel } from './model';

function response(state: string = 'queued') {
  return {
    deployment: {
      id: 'b1', project_id: 'p1', resource_type: 'road_network', resource_revision_id: 'r1',
      created_by: 'u1', idempotency_key: 'k1', cancel_requested_at: null,
      created_at: '2026-09-19 12:00:00+00',
      tasks: [{
        id: 't1', batch_id: 'b1', vehicle_id: 'v1', state, attempt: 0, max_attempts: 3,
        progress: 0, error_code: null, error_message: null, offered_at: null,
        accepted_at: null, delivered_at: null, updated_at: '2026-09-19 12:00:00+00',
      }],
    },
  };
}

describe('deployment model', () => {
  it('parses a deployment batch and labels queued accurately', () => {
    const deployment = parseDeploymentResponse(response());
    expect(deployment.tasks[0].vehicleId).toBe('v1');
    expect(stateLabel(deployment.tasks[0].state)).toBe('等待车辆上线');
    expect(deploymentTerminal(deployment)).toBe(false);
  });

  it('selects only terminal unsuccessful vehicles for retry', () => {
    const deployment = parseDeploymentResponse(response('failed'));
    expect(deploymentTerminal(deployment)).toBe(true);
    expect(retryableVehicleIds(deployment)).toEqual(['v1']);
  });

  it('rejects unknown task states', () => {
    expect(() => parseDeploymentResponse(response('mystery'))).toThrow('状态不受支持');
  });
});
