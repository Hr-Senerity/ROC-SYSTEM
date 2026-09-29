export const MAX_MAP_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_MAP_YAML_BYTES = 1024 * 1024;

export type MapUploadMode = 'image' | 'calibrated-image' | 'pgm-yaml';

const supportedMimeTypes = new Set(['image/png', 'image/jpeg']);
const supportedExtensions = /\.(?:png|jpe?g)$/i;

export interface MapImageFileInfo {
  name: string;
  type: string;
  size: number;
}

export function validateMapImageFile(file: MapImageFileInfo): string | null {
  if (!supportedMimeTypes.has(file.type) && !supportedExtensions.test(file.name)) {
    return '仅支持 PNG 或 JPEG 图片';
  }
  if (file.size > MAX_MAP_IMAGE_BYTES) {
    return `图片大小为 ${formatMiB(file.size)} MiB，不能超过 30 MiB`;
  }
  return null;
}

export function mapNameFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export function mapUploadTransportName(file: MapImageFileInfo): string {
  const jpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
  return jpeg ? 'map-upload.jpg' : 'map-upload.png';
}

export function validatePgmFile(file: MapImageFileInfo): string | null {
  if (!/\.pgm$/i.test(file.name)) return '请选择 .pgm 地图文件';
  if (file.size > MAX_MAP_IMAGE_BYTES) return `PGM 大小不能超过 30 MiB`;
  return null;
}

export function validateMapYamlFile(file: MapImageFileInfo): string | null {
  if (!/\.ya?ml$/i.test(file.name)) return '请选择 .yaml 或 .yml 元数据文件';
  if (file.size > MAX_MAP_YAML_BYTES) return 'YAML 大小不能超过 1 MiB';
  return null;
}

export interface ManualCalibration {
  resolution: string;
  originX: string;
  originY: string;
  originTheta: string;
}

export function validateManualCalibration(value: ManualCalibration): string | null {
  const resolution = Number(value.resolution);
  const origin = [value.originX, value.originY, value.originTheta].map(Number);
  if (!Number.isFinite(resolution) || resolution <= 0) return '分辨率必须是大于 0 的有限数值';
  if (origin.some((item) => !Number.isFinite(item))) return '原点 X、Y 和旋转角必须是有限数值';
  return null;
}

export function formatMiB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}
