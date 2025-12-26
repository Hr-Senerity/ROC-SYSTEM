import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { User, Mail, Phone, MapPin, Calendar, Edit2, Save, X, ArrowLeft, Shield, Bell, Zap } from 'lucide-react';

export function ProfilePage() {
  const { isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');

  // 模拟用户数据
  const [userInfo, setUserInfo] = useState({
    username: '张三',
    email: 'zhangsan@example.com',
    phone: '+86 138 8888 8888',
    location: '中国 北京',
    joinDate: '2024-01-15',
    bio: '热爱技术，追求卓越',
  });

  const [editForm, setEditForm] = useState(userInfo);

  if (!isLoggedIn) {
    navigate('/login');
    return null;
  }

  const handleSave = () => {
    setUserInfo(editForm);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm(userInfo);
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* 顶部导航栏 */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                返回首页
              </button>
            </div>

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
        <div className="grid lg:grid-cols-12 gap-6">
          {/* 左侧个人信息卡片 */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              {/* 头像 */}
              <div className="text-center mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-2xl text-slate-900 mb-1">{userInfo.username}</h2>
                <p className="text-slate-500">{userInfo.email}</p>
              </div>

              {/* 统计信息 */}
              <div className="grid grid-cols-3 gap-4 py-4 border-y border-slate-200">
                <div className="text-center">
                  <div className="text-2xl text-slate-900 mb-1">12</div>
                  <div className="text-slate-500">项目</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl text-slate-900 mb-1">48</div>
                  <div className="text-slate-500">任务</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl text-slate-900 mb-1">156</div>
                  <div className="text-slate-500">积分</div>
                </div>
              </div>

              {/* 个人简介 */}
              <div className="mt-6">
                <h3 className="text-slate-700 mb-2">个人简介</h3>
                <p className="text-slate-600">{userInfo.bio}</p>
              </div>

              {/* 加入时间 */}
              <div className="mt-6 flex items-center gap-2 text-slate-600">
                <Calendar className="w-4 h-4" />
                <span>加入于 {userInfo.joinDate}</span>
              </div>
            </div>
          </div>

          {/* 右侧详细信息 */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm">
              {/* 标签页导航 */}
              <div className="border-b border-slate-200">
                <div className="flex gap-8 px-6">
                  <button
                    onClick={() => setActiveTab('profile')}
                    className={`py-4 border-b-2 transition-colors ${
                      activeTab === 'profile'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      个人信息
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('security')}
                    className={`py-4 border-b-2 transition-colors ${
                      activeTab === 'security'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      安全设置
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('notifications')}
                    className={`py-4 border-b-2 transition-colors ${
                      activeTab === 'notifications'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      通知设置
                    </div>
                  </button>
                </div>
              </div>

              {/* 标签页内容 */}
              <div className="p-6">
                {activeTab === 'profile' && (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl text-slate-900">个人信息</h3>
                      {!isEditing ? (
                        <button
                          onClick={() => setIsEditing(true)}
                          className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                          编辑
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancel}
                            className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                            取消
                          </button>
                          <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                          >
                            <Save className="w-4 h-4" />
                            保存
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="block text-slate-700 mb-2">用户名</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.username}
                            onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-slate-900">
                            <User className="w-5 h-5 text-slate-400" />
                            {userInfo.username}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-2">邮箱地址</label>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-slate-900">
                            <Mail className="w-5 h-5 text-slate-400" />
                            {userInfo.email}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-2">手机号码</label>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editForm.phone}
                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-slate-900">
                            <Phone className="w-5 h-5 text-slate-400" />
                            {userInfo.phone}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-2">所在地区</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.location}
                            onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-slate-900">
                            <MapPin className="w-5 h-5 text-slate-400" />
                            {userInfo.location}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-slate-700 mb-2">个人简介</label>
                        {isEditing ? (
                          <textarea
                            value={editForm.bio}
                            onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={3}
                          />
                        ) : (
                          <div className="text-slate-900">{userInfo.bio}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'security' && (
                  <div>
                    <h3 className="text-xl text-slate-900 mb-6">安全设置</h3>
                    <div className="space-y-4">
                      <div className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-slate-900 mb-1">修改密码</h4>
                            <p className="text-slate-600">定期更换密码，保护账户安全</p>
                          </div>
                          <button className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            修改
                          </button>
                        </div>
                      </div>

                      <div className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-slate-900 mb-1">双因素认证</h4>
                            <p className="text-slate-600">增加额外的安全验证层</p>
                          </div>
                          <button className="px-4 py-2 bg-green-600 text-white rounded-lg">
                            已启用
                          </button>
                        </div>
                      </div>

                      <div className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-slate-900 mb-1">登录设备</h4>
                            <p className="text-slate-600">管理已登录的设备</p>
                          </div>
                          <button className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            查看
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'notifications' && (
                  <div>
                    <h3 className="text-xl text-slate-900 mb-6">通知设置</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div>
                          <h4 className="text-slate-900 mb-1">邮件通知</h4>
                          <p className="text-slate-600">接收重要更新和通知</p>
                        </div>
                        <input type="checkbox" className="w-5 h-5 text-blue-600" defaultChecked />
                      </div>

                      <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div>
                          <h4 className="text-slate-900 mb-1">短信通知</h4>
                          <p className="text-slate-600">账户安全相关的短信提醒</p>
                        </div>
                        <input type="checkbox" className="w-5 h-5 text-blue-600" defaultChecked />
                      </div>

                      <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div>
                          <h4 className="text-slate-900 mb-1">系统通知</h4>
                          <p className="text-slate-600">产品更新和新功能推送</p>
                        </div>
                        <input type="checkbox" className="w-5 h-5 text-blue-600" />
                      </div>

                      <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div>
                          <h4 className="text-slate-900 mb-1">营销推广</h4>
                          <p className="text-slate-600">接收优惠活动和市场资讯</p>
                        </div>
                        <input type="checkbox" className="w-5 h-5 text-blue-600" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}