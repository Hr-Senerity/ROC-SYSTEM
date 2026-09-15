export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface ViewTransform { viewport: Size; image: Size; padding: number; zoom: number; pan: Point }
export interface CoordinateMetadata {
  mode: 'legacy-normalized' | 'metric';
  image: Size;
  origin: Point;
  originTheta: number;
  resolution: number | null;
}

export function worldToMap(point: Point, metadata: CoordinateMetadata): Point | null {
  if (metadata.mode === 'legacy-normalized') {
    return {
      x: point.x / 100 * metadata.image.width,
      y: point.y / 100 * metadata.image.height,
    };
  }
  if (!metadata.resolution || metadata.resolution <= 0) return null;
  const dx = point.x - metadata.origin.x;
  const dy = point.y - metadata.origin.y;
  const cosine = Math.cos(metadata.originTheta);
  const sine = Math.sin(metadata.originTheta);
  const localX = cosine * dx + sine * dy;
  const localY = -sine * dx + cosine * dy;
  return {
    x: localX / metadata.resolution,
    y: metadata.image.height - localY / metadata.resolution,
  };
}

export function mapToWorld(point: Point, metadata: CoordinateMetadata): Point | null {
  if (metadata.mode === 'legacy-normalized') {
    return {
      x: point.x / metadata.image.width * 100,
      y: point.y / metadata.image.height * 100,
    };
  }
  if (!metadata.resolution || metadata.resolution <= 0) return null;
  const localX = point.x * metadata.resolution;
  const localY = (metadata.image.height - point.y) * metadata.resolution;
  const cosine = Math.cos(metadata.originTheta);
  const sine = Math.sin(metadata.originTheta);
  return {
    x: metadata.origin.x + cosine * localX - sine * localY,
    y: metadata.origin.y + sine * localX + cosine * localY,
  };
}

export function fitScale(transform: ViewTransform): number {
  const availableWidth = Math.max(1, transform.viewport.width - transform.padding * 2);
  const availableHeight = Math.max(1, transform.viewport.height - transform.padding * 2);
  return Math.min(availableWidth / transform.image.width, availableHeight / transform.image.height);
}

export function mapToScreen(point: Point, transform: ViewTransform): Point {
  const scale = fitScale(transform) * transform.zoom;
  return {
    x: transform.viewport.width / 2 + transform.pan.x + scale * (point.x - transform.image.width / 2),
    y: transform.viewport.height / 2 + transform.pan.y + scale * (point.y - transform.image.height / 2),
  };
}

export function screenToMap(point: Point, transform: ViewTransform): Point {
  const scale = fitScale(transform) * transform.zoom;
  return {
    x: transform.image.width / 2 + (point.x - transform.viewport.width / 2 - transform.pan.x) / scale,
    y: transform.image.height / 2 + (point.y - transform.viewport.height / 2 - transform.pan.y) / scale,
  };
}
