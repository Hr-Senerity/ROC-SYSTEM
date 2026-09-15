import { useState } from 'react';
import { CircleAlert, Lock, User } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';
import { AuthShell, authErrorMessage } from './AuthShell';
import { Button } from './ui/button';

const inputClassName = 'h-12 w-full rounded-xl border border-[#dfe3e9] bg-[#fafbfc] pl-11 pr-4 text-[15px] text-[#161c28] outline-none transition placeholder:text-[#a5abb5] hover:border-[#cbd2dc] focus:border-[#2f6bff] focus:bg-white focus:ring-4 focus:ring-[#2f6bff]/10';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username || !password) {
      setError('请填写用户名和密码');
      return;
    }

    setLoading(true);
    const result = await login(username, password);
    setLoading(false);

    if (result.ok) {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || '/projects', { replace: true });
    } else {
      setError(authErrorMessage(result.message, '登录失败，请稍后重试'));
    }
  };

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="欢迎回来"
      description="登录后继续管理你的项目、地图与机器人运行状态。"
      footer={<><span>还没有账户？</span>{' '}<Link to="/register" className="font-semibold text-[#2f6bff] transition hover:text-[#1f56dd]">免费创建账户</Link></>}
    >
      {error && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#f5c8c7] bg-[#fff5f4] px-3.5 py-3 text-sm leading-5 text-[#b63c38]">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="login-username" className="mb-2 block text-sm font-medium text-[#343b49]">用户名</label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8d95a3]" />
            <input id="login-username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputClassName} placeholder="请输入用户名" autoFocus />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-[#343b49]">密码</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8d95a3]" />
            <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClassName} placeholder="请输入密码" />
          </div>
        </div>

        <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-[#111722] text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(17,23,34,.14)] transition hover:-translate-y-0.5 hover:bg-[#2f6bff]">
          {loading ? '正在登录…' : '进入工作台'}
        </Button>
      </form>
    </AuthShell>
  );
}
