// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';

const authMocks = vi.hoisted(() => ({
  register: vi.fn(),
}));

vi.mock('../app/auth/AuthProvider', () => ({
  useAuth: () => ({ register: authMocks.register }),
}));

function renderRegister() {
  return render(
    <MemoryRouter
      initialEntries={['/register']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/projects" element={<div>项目工作台</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillBaseForm(invitationCode = 'A2B3C') {
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'new-user' } });
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'new-user@example.com' } });
  fireEvent.change(screen.getByLabelText('邀请码'), { target: { value: invitationCode } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret12' } });
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'secret12' } });
}

afterEach(cleanup);

beforeEach(() => {
  authMocks.register.mockReset();
});

describe('RegisterPage', () => {
  it('rejects an incomplete form without calling the API', () => {
    renderRegister();

    fireEvent.click(screen.getByRole('button', { name: '创建账户' }));

    expect(screen.getByRole('alert').textContent).toContain('请填写所有字段');
    expect(authMocks.register).not.toHaveBeenCalled();
  });

  it('normalizes the invitation code and submits a valid registration', async () => {
    authMocks.register.mockResolvedValue({ ok: true });
    renderRegister();
    fillBaseForm('a2-b3c');

    expect((screen.getByLabelText('邀请码') as HTMLInputElement).value).toBe('A2B3C');
    fireEvent.click(screen.getByRole('button', { name: '创建账户' }));

    await waitFor(() => expect(authMocks.register).toHaveBeenCalledWith(
      'new-user',
      'new-user@example.com',
      'secret12',
      'A2B3C',
    ));
    expect(await screen.findByText('项目工作台')).toBeTruthy();
  });

  it('requires a five-character invitation code containing letters and numbers', () => {
    renderRegister();
    fillBaseForm('ABCDE');

    fireEvent.click(screen.getByRole('button', { name: '创建账户' }));

    expect(screen.getByRole('alert').textContent).toContain('邀请码必须是 5 位字符，并同时包含数字和字母');
    expect(authMocks.register).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords before submission', () => {
    renderRegister();
    fillBaseForm();
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'different' } });

    fireEvent.click(screen.getByRole('button', { name: '创建账户' }));

    expect(screen.getByRole('alert').textContent).toContain('两次输入的密码不一致');
    expect(authMocks.register).not.toHaveBeenCalled();
  });

  it('shows the shared error for an invalid, used, or revoked invitation code', async () => {
    authMocks.register.mockResolvedValue({ ok: false, message: 'Invitation code has already been used' });
    renderRegister();
    fillBaseForm();

    fireEvent.click(screen.getByRole('button', { name: '创建账户' }));

    expect(await screen.findByText('邀请码无效、已使用或已撤销')).toBeTruthy();
  });
});
