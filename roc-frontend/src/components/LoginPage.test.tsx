// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
}));

vi.mock('../app/auth/AuthProvider', () => ({
  useAuth: () => ({ login: authMocks.login }),
}));

function renderLogin(initialEntry: string | { pathname: string; state?: unknown } = '/login') {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/projects" element={<div>项目工作台</div>} />
        <Route path="/requested" element={<div>原请求页面</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

beforeEach(() => {
  authMocks.login.mockReset();
});

describe('LoginPage', () => {
  it('rejects an empty form without calling the API', () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect(screen.getByRole('alert').textContent).toContain('请填写用户名和密码');
    expect(authMocks.login).not.toHaveBeenCalled();
  });

  it('submits credentials and restores the requested route', async () => {
    authMocks.login.mockResolvedValue({ ok: true });
    renderLogin({ pathname: '/login', state: { from: '/requested' } });

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'operator' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret12' } });
    fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    await waitFor(() => expect(authMocks.login).toHaveBeenCalledWith('operator', 'secret12'));
    expect(await screen.findByText('原请求页面')).toBeTruthy();
  });

  it('shows a localized authentication error', async () => {
    authMocks.login.mockResolvedValue({ ok: false, message: 'Invalid username or password' });
    renderLogin();

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'operator' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));

    expect(await screen.findByText('用户名或密码错误，请重新输入')).toBeTruthy();
  });
});
