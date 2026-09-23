// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorState } from './ErrorState';

afterEach(cleanup);

describe('ErrorState', () => {
  it('announces the failure without showing an unavailable action', () => {
    render(<ErrorState message="地图暂时不可用" />);

    expect(screen.getByRole('alert').textContent).toContain('地图暂时不可用');
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });

  it('invokes the retry action', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="请求超时" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
