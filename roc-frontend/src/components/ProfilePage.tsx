import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API_BASE } from '../App';
import { User, Mail, Calendar, ArrowLeft, Shield, Bell, Zap, Lock, Save } from 'lucide-react';

export function ProfilePage() {
  const { isLoggedIn, logout, token, username, role } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [userInfo, setUserInfo] = useState({ username: '', email: '', role: '', status: '', created_at: '' });

  // Security form
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notifications
  const [notifyOnline, setNotifyOnline] = useState(true);
  const [notifyError, setNotifyError] = useState(true);
  const [notifyLowBattery, setNotifyLowBattery] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) { navigate('/login'); return; }
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json();
      if (data.ok && data.user) {
        setUserInfo({
          username: data.user.username || '',
          email: data.user.email || '',
          role: data.user.role || '',
          status: data.user.status || '',
          created_at: data.user.created_at || '',
        });
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) { setMsg('请填写所有密码字段'); return; }
    if (newPassword !== confirmPassword) { setMsg('两次密码不一致'); return; }
    if (newPassword.length < 6) { setMsg('新密码至少6个字符'); return; }
    setSaving(true);
    try {
      const resp = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const data = await resp.json();
      if (data.ok) {
        setMsg('密码修改成功');
        setOldPassword(''); setNewPassword(''); setConfirmPassword('');
      } else {
        setMsg(data.message || '修改失败');
      }
    } catch { setMsg('网络错误'); }
    setSaving(false);
  };

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button onClick={() => navigate('/')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
              <ArrowLeft className="w-5 h-5" /> 返回首页
            </button>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl text-slate-900">ROC平台</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-6">
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm p-4 sticky top-24">
              {/* Avatar */}
              <div className="flex flex-col items-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mb-3">
                  <User className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl text-slate-900">{userInfo.username}</h2>
                <span className={`text-sm mt-1 px-2 py-0.5 rounded-full ${
                  userInfo.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {userInfo.role === 'super_admin' ? '超级管理员' : '普通用户'}
                </span>
              </div>

              <nav className="space-y-2">
                <button onClick={() => setActiveTab('profile')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'profile' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}>
                  <User className="w-5 h-5" /> 个人信息
                </button>
                <button onClick={() => setActiveTab('security')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'security' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}>
                  <Shield className="w-5 h-5" /> 账户安全
                </button>
                <button onClick={() => setActiveTab('notifications')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeTab === 'notifications' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                  }`}>
                  <Bell className="w-5 h-5" /> 通知设置
                </button>
              </nav>
            </div>
          </div>

          <div className="flex-1">
            <div className="bg-white rounded-xl shadow-sm p-6">
              {activeTab === 'profile' && (
                <div>
                  <h2 className="text-2xl text-slate-900 mb-6">个人信息</h2>
                  {loading ? <p className="text-slate-400">加载中...</p> : (
                    <div className="grid grid-cols-2 gap-6">
                      <div><label className="block text-slate-500 text-sm mb-1">用户名</label><p className="text-slate-900">{userInfo.username}</p></div>
                      <div><label className="block text-slate-500 text-sm mb-1">邮箱</label><p className="text-slate-900">{userInfo.email || '—'}</p></div>
                      <div><label className="block text-slate-500 text-sm mb-1">角色</label><p className="text-slate-900">{userInfo.role === 'super_admin' ? '超级管理员' : '普通用户'}</p></div>
                      <div><label className="block text-slate-500 text-sm mb-1">状态</label><p className={userInfo.status === 'active' ? 'text-green-600' : 'text-red-600'}>{userInfo.status === 'active' ? '活跃' : '已停用'}</p></div>
                      <div className="col-span-2"><label className="block text-slate-500 text-sm mb-1">注册时间</label><p className="text-slate-900">{new Date(userInfo.created_at).toLocaleString('zh-CN')}</p></div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'security' && (
                <div>
                  <h2 className="text-2xl text-slate-900 mb-6">账户安全</h2>
                  {msg && (
                    <div className={`mb-4 p-3 rounded-lg text-center ${msg.includes('成功') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg}</div>
                  )}
                  <div className="max-w-md space-y-4">
                    <div>
                      <label className="block text-slate-700 mb-2">当前密码</label>
                      <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-slate-700 mb-2">新密码</label>
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="至少6个字符" />
                    </div>
                    <div>
                      <label className="block text-slate-700 mb-2">确认新密码</label>
                      <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <button onClick={handleChangePassword} disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      <Save className="w-5 h-5" /> {saving ? '保存中...' : '修改密码'}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div>
                  <h2 className="text-2xl text-slate-900 mb-6">通知设置</h2>
                  <div className="space-y-4 max-w-md">
                    <label className="flex items-center justify-between p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <div><p className="text-slate-900">车辆上线通知</p><p className="text-slate-500 text-sm">当车辆状态变为在线时通知</p></div>
                      <input type="checkbox" checked={notifyOnline} onChange={e => setNotifyOnline(e.target.checked)} className="w-5 h-5 text-blue-600" />
                    </label>
                    <label className="flex items-center justify-between p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <div><p className="text-slate-900">异常报警</p><p className="text-slate-500 text-sm">当车辆出现错误状态时通知</p></div>
                      <input type="checkbox" checked={notifyError} onChange={e => setNotifyError(e.target.checked)} className="w-5 h-5 text-blue-600" />
                    </label>
                    <label className="flex items-center justify-between p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <div><p className="text-slate-900">低电量警告</p><p className="text-slate-500 text-sm">当车辆电量低于20%时通知</p></div>
                      <input type="checkbox" checked={notifyLowBattery} onChange={e => setNotifyLowBattery(e.target.checked)} className="w-5 h-5 text-blue-600" />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
