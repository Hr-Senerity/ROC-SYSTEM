// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapUploadModal } from './MapUploadModal';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../shared/api/client', () => ({ apiRequest: mocks.apiRequest }));

afterEach(cleanup);

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequest.mockResolvedValue({ ok: true });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

describe('MapUploadModal', () => {
  it('submits PGM and YAML through the unified source mode', async () => {
    const uploaded = vi.fn();
    render(<MapUploadModal projectId="project-1" token="account-token" onClose={vi.fn()} onUploaded={uploaded} />);

    fireEvent.click(screen.getByRole('radio', { name: /PGM \+ YAML/ }));
    fireEvent.change(screen.getByLabelText('选择 PGM 地图文件'), {
      target: { files: [new File(['P2\n1 1\n255\n0\n'], 'warehouse.pgm')] },
    });
    fireEvent.change(screen.getByLabelText('选择地图 YAML 文件'), {
      target: { files: [new File(['image: warehouse.pgm'], 'warehouse.yaml')] },
    });
    fireEvent.click(screen.getByRole('button', { name: '上传地图' }));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledTimes(1));
    const [path, options] = mocks.apiRequest.mock.calls[0] as [string, { method: string; token: string; body: FormData }];
    expect(path).toBe('/api/projects/project-1/maps/upload');
    expect(options.method).toBe('POST');
    expect(options.token).toBe('account-token');
    expect(options.body.get('source_type')).toBe('pgm-yaml');
    expect((options.body.get('pgm') as File).name).toBe('map-source.pgm');
    expect((options.body.get('yaml') as File).name).toBe('map-source.yaml');
    expect(uploaded).toHaveBeenCalledTimes(1);
  });

  it('blocks invalid manual calibration before making a request', () => {
    render(<MapUploadModal projectId="project-1" token="account-token" onClose={vi.fn()} onUploaded={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /图片并标定/ }));
    fireEvent.change(screen.getByLabelText('选择地图图片文件'), {
      target: { files: [new File(['png'], 'map.png', { type: 'image/png' })] },
    });
    fireEvent.change(screen.getByLabelText('分辨率（米/像素）'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '上传地图' }));

    expect(screen.getByRole('alert').textContent).toContain('分辨率必须是大于 0');
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });
});
