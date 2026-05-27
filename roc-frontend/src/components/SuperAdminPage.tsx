import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API_BASE } from '../App';
import { ArrowLeft, Zap, Shield, Search, Trash2, UserX, UserCheck, Eye, Users, Server, Box } from 'lucide-react';

interface UserData {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface UserStats {
  projects: number;
  vehicles: number;
}

interface SystemStats {
  total_users: number;
  active_users: number;
  total_projects: number;
  total_vehicles: number;
  online_vehicles: number;
}

export function SuperAdminPage() {
  const { token, username } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const [stats, setStats] = useState<SystemStats | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);

      const resp = await fetch(`${API_BASE}/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) {
        setUsers(data.users || []);
        setTotal(data.total || 0);
      } else {
        setError(data.message || 'Failed to load users');
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) setStats(data.stats);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    const action = newStatus === 'disabled' ? '停用' : '启用';
    if (!window.confirm(`确定要${action}该账户吗？`)) return;

    try {
      const resp = await fetch(`${API_BASE}/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await resp.json();
      if (data.ok) {
        fetchUsers();
      } else {
        alert(data.message || '操作失败');
      }
    } catch {
      alert('网络错误');
    }
  };

  const handleDelete = async (userId: string) => {
    if (!window.confirm('确定要删除该用户吗？此操作不可撤销，将级联删除其所有项目、车辆数据。')) return;

    try {
      const resp = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) {
        fetchUsers();
        setShowDetail(false);
      } else {
        alert(data.message || '删除失败');
      }
    } catch {
      alert('网络错误');
    }
  };

  const handleViewDetail = async (user: UserData) => {
    setSelectedUser(user);
    setShowDetail(true);
    try {
      const resp = await fetch(`${API_BASE}/api/admin/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) {
        setUserStats(data.stats);
      }
    } catch { /* ignore */ }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/projects')}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                返回
              </button>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" />
                <span className="text-slate-900 font-medium">超级管理员</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl text-slate-900">ROC平台</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-slate-500 text-sm">总用户</span>
              </div>
              <p className="text-2xl text-slate-900">{stats.total_users}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <UserCheck className="w-4 h-4 text-green-500" />
                <span className="text-slate-500 text-sm">活跃</span>
              </div>
              <p className="text-2xl text-slate-900">{stats.active_users}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <Box className="w-4 h-4 text-orange-500" />
                <span className="text-slate-500 text-sm">项目</span>
              </div>
              <p className="text-2xl text-slate-900">{stats.total_projects}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <Server className="w-4 h-4 text-purple-500" />
                <span className="text-slate-500 text-sm">车辆</span>
              </div>
              <p className="text-2xl text-slate-900">{stats.total_vehicles}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                <span className="text-slate-500 text-sm">在线</span>
              </div>
              <p className="text-2xl text-slate-900">{stats.online_vehicles}</p>
            </div>
          </div>
        )}

        <div className="flex gap-6">
          {/* Main list */}
          <div className={`${showDetail ? 'w-2/3' : 'w-full'} transition-all`}>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-2xl text-slate-900 mb-6">用户管理</h2>

              {/* Search & Filters */}
              <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-6">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="搜索用户名或邮箱..."
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部角色</option>
                  <option value="super_admin">超级管理员</option>
                  <option value="regular">普通用户</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全部状态</option>
                  <option value="active">活跃</option>
                  <option value="disabled">已停用</option>
                </select>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  搜索
                </button>
              </form>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600">
                  {error}
                </div>
              )}

              {/* Users Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">用户名</th>
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">邮箱</th>
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">角色</th>
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">状态</th>
                      <th className="text-left py-3 px-4 text-slate-600 font-medium">注册时间</th>
                      <th className="text-right py-3 px-4 text-slate-600 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-slate-900">{user.username}</td>
                        <td className="py-3 px-4 text-slate-600">{user.email}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs ${
                            user.role === 'super_admin'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {user.role === 'super_admin' ? '管理员' : '普通用户'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                            user.status === 'active'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              user.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                            }`} />
                            {user.status === 'active' ? '活跃' : '已停用'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-sm">
                          {new Date(user.created_at).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleViewDetail(user)}
                              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                              title="查看详情"
                            >
                              <Eye className="w-4 h-4 text-slate-500" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(user.id, user.status)}
                              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                              title={user.status === 'active' ? '停用' : '启用'}
                            >
                              {user.status === 'active' ? (
                                <UserX className="w-4 h-4 text-orange-500" />
                              ) : (
                                <UserCheck className="w-4 h-4 text-green-500" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && !loading && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          暂无用户数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <span className="text-slate-600 text-sm">共 {total} 个用户</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                      className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      上一页
                    </button>
                    <span className="px-4 py-2 text-slate-600">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                      className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Detail Panel */}
          {showDetail && selectedUser && (
            <div className="w-1/3">
              <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl text-slate-900">用户详情</h3>
                  <button
                    onClick={() => setShowDetail(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-slate-500 text-sm">用户名</label>
                    <p className="text-slate-900">{selectedUser.username}</p>
                  </div>
                  <div>
                    <label className="text-slate-500 text-sm">邮箱</label>
                    <p className="text-slate-900">{selectedUser.email}</p>
                  </div>
                  <div>
                    <label className="text-slate-500 text-sm">角色</label>
                    <p className="text-slate-900">
                      {selectedUser.role === 'super_admin' ? '超级管理员' : '普通用户'}
                    </p>
                  </div>
                  <div>
                    <label className="text-slate-500 text-sm">状态</label>
                    <p className={`${selectedUser.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedUser.status === 'active' ? '活跃' : '已停用'}
                    </p>
                  </div>
                  <div>
                    <label className="text-slate-500 text-sm">注册时间</label>
                    <p className="text-slate-900">
                      {new Date(selectedUser.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>

                  {userStats && (
                    <>
                      <hr className="border-slate-200" />
                      <div>
                        <label className="text-slate-500 text-sm">关联数据统计</label>
                        <div className="flex gap-4 mt-2">
                          <div className="bg-slate-50 rounded-lg p-3 flex-1 text-center">
                            <p className="text-2xl text-slate-900">{userStats.projects}</p>
                            <p className="text-slate-500 text-xs">项目</p>
                          </div>
                          <div className="bg-slate-50 rounded-lg p-3 flex-1 text-center">
                            <p className="text-2xl text-slate-900">{userStats.vehicles}</p>
                            <p className="text-slate-500 text-xs">车辆</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex gap-2 pt-4">
                    <button
                      onClick={() => handleToggleStatus(selectedUser.id, selectedUser.status)}
                      className="flex-1 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm"
                    >
                      {selectedUser.status === 'active' ? '停用账户' : '启用账户'}
                    </button>
                    <button
                      onClick={() => handleDelete(selectedUser.id)}
                      className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
                    >
                      删除用户
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
