import { describe, expect, it } from 'vitest';
import type { Vehicle } from './model';
import { mergeVehicleEvent, mergeVehicleSnapshot, removeVehicleEvent } from './realtimeModel';

function vehicle(id: string, version: string, battery: number): Vehicle {
  return {
    id,
    projectId: 'project-1',
    mapId: null,
    name: id,
    ip: '127.0.0.1',
    status: 'online',
    cpu: 1,
    memory: 2,
    battery,
    localizationConfidence: 3,
    position: null,
    velocity: { linear: 0, angular: 0 },
    deliveryPath: [],
    version,
    receivedAt: null,
    lastHeartbeat: null,
    deviceEnabled: false,
    deviceTokenHint: null,
    deliveredRoadRevisionId: null,
    deliveredMapArtifactId: null,
  };
}

describe('vehicle realtime merge', () => {
  it('does not let an older snapshot overwrite a newer event', () => {
    const latest = vehicle('vehicle-1', '11', 91);
    const stale = vehicle('vehicle-1', '10', 40);
    expect(mergeVehicleSnapshot([latest], [stale])).toEqual([latest]);
  });

  it('accepts a newer event and inserts a new vehicle', () => {
    const first = vehicle('vehicle-1', '1', 20);
    const updated = vehicle('vehicle-1', '2', 80);
    expect(mergeVehicleEvent([first], updated)[0]).toEqual(updated);
    expect(mergeVehicleEvent([first], vehicle('vehicle-2', '0', 100))).toHaveLength(2);
  });

  it('removes a deleted vehicle', () => {
    expect(removeVehicleEvent([vehicle('vehicle-1', '1', 20)], 'vehicle-1')).toEqual([]);
  });
});
