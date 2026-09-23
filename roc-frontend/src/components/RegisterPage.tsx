import { useState } from 'react';
import { CircleAlert, KeyRound, Lock, Mail, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';
import { isInvitationCodeComplete, normalizeInvitationCodeInput } from '../features/invitations/model';
import { AuthShell, authErrorMessage } from './AuthShell';
import { Button } from './ui/button';

const inputClassName = 'h-11 w-full rounded-xl border border-[#dfe3e9] bg-[#fafbfc] pl-11 pr-4 text-[15px] text-[#161c28] outline-none transition placeholder:text-[#a5abb5] hover:border-[#cbd2dc] focus:border-[#2f6bff] focus:bg-white focus:ring-4 focus:ring-[#2f6bff]/10';

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username || !email || !password || !confirmPassword || !invitationCode) {
      setError('请填写所有字段');
      return;
    }
    if (!isInvitationCodeComplete(invitationCode)) {
      setError('邀请码必须是 5 位字符，并同时包含数字和字母');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码长度至少为 6 个字符');
      return;
    }

    setLoading(true);
    const result = await register(username, email, password, invitationCode);
    setLoading(false);

    if (result.ok) {
      navigate('/projects');
    } else {
      setError(authErrorMessage(result.message, '注册失败，请稍后重试'));
    }
  };

  return (
    <AuthShell
      eyebrow="Create workspace"
      title="创建你的账户"
      description="使用管理员提供的一次性邀请码创建普通用户账户。"
      footer={<><span>已经有账户？</span>{' '}<Link to="/login" className="font-semibold text-[#2f6bff] transition hover:text-[#1f56dd]">返回登录</Link></>}
    >
      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#f5c8c7] bg-[#fff5f4] px-3.5 py-3 text-sm leading-5 text-[#b63c38]">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField id="register-username" label="用户名" type="text" autoComplete="username" value={username} onChange={setUsername} placeholder="为账户设置用户名" icon={User} autoFocus />
        <AuthField id="register-email" label="邮箱" type="email" autoComplete="email" value={email} onChange={setEmail} placeholder="name@example.com" icon={Mail} />
        <AuthField id="register-invitation-code" label="邀请码" type="text" autoComplete="off" value={invitationCode} onChange={(value) => setInvitationCode(normalizeInvitationCodeInput(value))} placeholder="5 位数字与字母" icon={KeyRound} maxLength={5} />
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField id="register-password" label="密码" type="password" autoComplete="new-password" value={password} onChange={setPassword} placeholder="至少 6 个字符" icon={Lock} />
          <AuthField id="register-confirm-password" label="确认密码" type="password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} placeholder="再次输入" icon={Lock} />
        </div>

        <Button type="submit" disabled={loading} className="mt-2 h-12 w-full rounded-xl bg-[#111722] text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(17,23,34,.14)] transition hover:-translate-y-0.5 hover:bg-[#2f6bff]">
          {loading ? '正在创建…' : '创建账户'}
        </Button>
      </form>
    </AuthShell>
  );
}

interface AuthFieldProps {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon: typeof User;
  autoFocus?: boolean;
  maxLength?: number;
}

function AuthField({ id, label, type, autoComplete, value, onChange, placeholder, icon: Icon, autoFocus, maxLength }: AuthFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[#343b49]">{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8d95a3]" />
        <input id={id} type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className={inputClassName} placeholder={placeholder} autoFocus={autoFocus} maxLength={maxLength} />
      </div>
    </div>
  );
}
