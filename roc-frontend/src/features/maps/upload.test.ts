import { describe, expect, it } from 'vitest';
import {
  mapNameFromFileName,
  mapUploadTransportName,
  validateManualCalibration,
  validateMapYamlFile,
  validateMapImageFile,
  validatePgmFile,
} from './upload';

describe('map image upload model', () => {
  it('accepts both provided PNG size profiles', () => {
    expect(validateMapImageFile({
      name: '【哲风壁纸】3D建模-俏皮.png',
      type: 'image/png',
      size: 25_091_490,
    })).toBeNull();
    expect(validateMapImageFile({
      name: '【哲风壁纸】凌乱黑发-壁纸.png',
      type: 'image/png',
      size: 4_962_454,
    })).toBeNull();
  });

  it('validates paired PGM and YAML sources', () => {
    expect(validatePgmFile({ name: 'warehouse.PGM', type: '', size: 2048 })).toBeNull();
    expect(validateMapYamlFile({ name: 'warehouse.yaml', type: '', size: 1024 })).toBeNull();
    expect(validatePgmFile({ name: 'warehouse.png', type: 'image/png', size: 2048 }))
      .toContain('.pgm');
    expect(validateMapYamlFile({ name: 'warehouse.txt', type: '', size: 1024 }))
      .toContain('.yaml');
  });

  it('requires finite manual metric calibration values', () => {
    expect(validateManualCalibration({ resolution: '0.05', originX: '-10', originY: '-20', originTheta: '0' }))
      .toBeNull();
    expect(validateManualCalibration({ resolution: '0', originX: '0', originY: '0', originTheta: '0' }))
      .toContain('分辨率');
    expect(validateManualCalibration({ resolution: '0.05', originX: 'NaN', originY: '0', originTheta: '0' }))
      .toContain('原点');
  });

  it('keeps the Unicode display name but uses a safe transport filename', () => {
    const file = { name: '一层仓库地图.png', type: 'image/png', size: 1024 };
    expect(mapNameFromFileName(file.name)).toBe('一层仓库地图');
    expect(mapUploadTransportName(file)).toBe('map-upload.png');
  });

  it('supports extension fallback when the browser omits MIME', () => {
    expect(validateMapImageFile({ name: '地图.JPEG', type: '', size: 2048 })).toBeNull();
    expect(mapUploadTransportName({ name: '地图.JPEG', type: '', size: 2048 })).toBe('map-upload.jpg');
  });

  it('rejects unsupported formats and files over 30 MiB', () => {
    expect(validateMapImageFile({ name: 'map.webp', type: 'image/webp', size: 1024 }))
      .toBe('仅支持 PNG 或 JPEG 图片');
    expect(validateMapImageFile({ name: 'map.png', type: 'image/png', size: 31 * 1024 * 1024 }))
      .toContain('不能超过 30 MiB');
  });
});
