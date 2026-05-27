import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, API_BASE } from '../App';
import { Plus, Trash2, FolderOpen, ArrowLeft, Zap, Calendar } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
}

export function ProjectsPage() {
  const { isLoggedIn, token } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchProjects = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) setProjects(data.projects || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    if (!isLoggedIn) { navigate('/login'); return; }
    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) { alert('请输入项目名称'); return; }
    setCreating(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newProjectName, description: newProjectDesc }),
      });
      const data = await resp.json();
      if (data.ok) {
        setProjects([data.project, ...projects]);
        setNewProjectName('');
        setNewProjectDesc('');
        setShowCreateModal(false);
      } else {
        alert(data.message || '创建失败');
      }
    } catch { alert('网络错误'); }
    setCreating(false);
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除此项目吗？')) return;
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (data.ok) setProjects(projects.filter(p => p.id !== id));
      else alert(data.message || '删除失败');
    } catch { alert('网络错误'); }
  };

  if (!isLoggedIn) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
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
        <div className="mb-8">
          <h1 className="text-3xl text-slate-900 mb-2">我的项目</h1>
          <p className="text-slate-600">管理您的所有项目和机器人</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <div
            onClick={() => setShowCreateModal(true)}
            className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all min-h-[200px] group"
          >
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
              <Plus className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
            </div>
            <p className="text-slate-600 group-hover:text-blue-600">新建项目</p>
          </div>

          {loading && <p className="text-slate-400 col-span-full text-center py-12">加载中...</p>}

          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => navigate(`/project/${project.id}`)}
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer min-h-[200px] flex flex-col relative group"
            >
              <button
                onClick={(e) => handleDeleteProject(project.id, e)}
                className="absolute top-4 right-4 p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 className="w-5 h-5 text-red-500" />
              </button>
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mb-4">
                <FolderOpen className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl text-slate-900 mb-2">{project.name}</h3>
              <p className="text-slate-600 mb-4 flex-1">{project.description || '暂无描述'}</p>
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-slate-500">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(project.created_at).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl text-slate-900 mb-6">新建项目</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-700 mb-2">项目名称</label>
                <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="请输入项目名称" autoFocus />
              </div>
              <div>
                <label className="block text-slate-700 mb-2">项目描述</label>
                <textarea value={newProjectDesc} onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入项目描述（可选）" rows={3} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => { setShowCreateModal(false); setNewProjectName(''); setNewProjectDesc(''); }}
                className="flex-1">取消</Button>
              <Button onClick={handleCreateProject} disabled={creating}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                {creating ? '创建中...' : '创建'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
