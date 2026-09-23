export const MAX_MAP_IMAGE_BYTES = 30 * 1024 * 1024;

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

export function formatMiB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}
