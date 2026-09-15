import type { Vehicle } from './model';

function version(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function shouldAcceptVehicle(current: Vehicle | undefined, incoming: Vehicle): boolean {
  return !current || version(incoming.version) >= version(current.version);
}

export function mergeVehicleEvent(current: Vehicle[], incoming: Vehicle): Vehicle[] {
  const index = current.findIndex((vehicle) => vehicle.id === incoming.id);
  if (index < 0) return [incoming, ...current];
  if (!shouldAcceptVehicle(current[index], incoming)) return current;
  const next = [...current];
  next[index] = incoming;
  return next;
}

export function mergeVehicleSnapshot(current: Vehicle[], incoming: Vehicle[]): Vehicle[] {
  const existing = new Map(current.map((vehicle) => [vehicle.id, vehicle]));
  return incoming.map((vehicle) => {
    const previous = existing.get(vehicle.id);
    return shouldAcceptVehicle(previous, vehicle) ? vehicle : previous!;
  });
}

export function removeVehicleEvent(current: Vehicle[], vehicleId: string): Vehicle[] {
  return current.filter((vehicle) => vehicle.id !== vehicleId);
}
