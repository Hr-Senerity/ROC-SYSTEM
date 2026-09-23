// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationCodesPanel } from './InvitationCodesPanel';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('../app/auth/AuthProvider', () => ({
  useAuth: () => ({ token: 'test-account-token' }),
}));

vi.mock('../shared/api/client', () => ({
  apiRequest: mocks.apiRequest,
}));

afterEach(cleanup);

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.apiRequest.mockResolvedValue({ invitation_codes: [], total: 21, page: 1, limit: 10 });
});

describe('InvitationCodesPanel', () => {
  it('loads server-side pages and displays the total', async () => {
    render(<InvitationCodesPanel />);

    expect(await screen.findByText('共 21 个邀请码')).toBeTruthy();
    expect(mocks.apiRequest).toHaveBeenCalledWith(
      '/api/admin/invitation-codes?page=1&limit=10',
      { token: 'test-account-token' },
    );

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      '/api/admin/invitation-codes?page=2&limit=10',
      { token: 'test-account-token' },
    ));
  });

  it('resets to the first page when filtering by status', async () => {
    render(<InvitationCodesPanel />);
    await screen.findByText('共 21 个邀请码');

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('筛选邀请码状态'), { target: { value: 'available' } });

    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith(
      '/api/admin/invitation-codes?page=1&limit=10&status=available',
      { token: 'test-account-token' },
    ));
  });
});
