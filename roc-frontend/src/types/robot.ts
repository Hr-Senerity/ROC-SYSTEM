export interface RobotPosition {
  x: number;
  y: number;
  theta: number;
}

export interface RobotVelocity {
  linear: number;
  angular: number;
}

export interface PathNode {
  x: number;
  y: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface Robot {
  id: string;
  name: string;
  ip: string;
  status: 'online' | 'offline' | 'error';
  cpu: number;
  memory: number;
  battery: number;
  localizationConfidence: number;
  position: RobotPosition;
  velocity: RobotVelocity;
  deliveryPath: PathNode[];
  logs: LogEntry[];
}
