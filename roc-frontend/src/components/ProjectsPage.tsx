import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Plus, Trash2, FolderOpen, ArrowLeft, Zap, Calendar } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  robotCount: number;
}

export function ProjectsPage() {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([
    {
      id: '1',
      name: '智能配送项目',
      description: '自动化配送机器人管理系统',
      createdAt: '2024-12-01',
      robotCount: 5,
    },
    {
      id: '2',
      name: '仓储管理系统',
      description: '智能仓储机器人调度平台',
      createdAt: '2024-12-10',
      robotCount: 8,
    },
    {
      id: '3',
      name: '巡检机器人',
      description: '工厂巡检机器人监控系统',
      createdAt: '2024-12-15',
      robotCount: 3,
    },
  ]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  if (!isLoggedIn) {
    navigate('/login');
    return null;
  }

  const handleCreateProject = () => {
    if (!newProjectName.trim()) {
      alert('请输入项目名称');
      return;
    }

    const newProject: Project = {
      id: Date.now().toString(),
      name: newProjectName,
      description: newProjectDesc,
      createdAt: new Date().toISOString().split('T')[0],
      robotCount: 0,
    };

    setProjects([...projects, newProject]);
    setNewProjectName('');
    setNewProjectDesc('');
    setShowCreateModal(false);
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('确定要删除此项目吗？')) {
      setProjects(projects.filter((p) => p.id !== id));
    }
  };

  const handleProjectClick = (id: string) => {
    navigate(`/project/${id}`);
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

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 页头 */}
        <div className="mb-8">
          <h1 className="text-3xl text-slate-900 mb-2">我的项目</h1>
          <p className="text-slate-600">管理您的所有项目和机器人</p>
        </div>

        {/* 项目网格 */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* 新建项目卡片 */}
          <div
            onClick={() => setShowCreateModal(true)}
            className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all min-h-[200px] group"
          >
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
              <Plus className="w-8 h-8 text-slate-400 group-hover:text-blue-600" />
            </div>
            <p className="text-slate-600 group-hover:text-blue-600">新建项目</p>
          </div>

          {/* 项目卡片 */}
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project.id)}
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer min-h-[200px] flex flex-col relative group"
            >
              {/* 删除按钮 */}
              <button
                onClick={(e) => handleDeleteProject(project.id, e)}
                className="absolute top-4 right-4 p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 className="w-5 h-5 text-red-500" />
              </button>

              {/* 项目图标 */}
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center mb-4">
                <FolderOpen className="w-6 h-6 text-white" />
              </div>

              {/* 项目信息 */}
              <h3 className="text-xl text-slate-900 mb-2">{project.name}</h3>
              <p className="text-slate-600 mb-4 flex-1">{project.description}</p>

              {/* 项目元数据 */}
              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-slate-500">
                  <Calendar className="w-4 h-4" />
                  <span>{project.createdAt}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Zap className="w-4 h-4" />
                  <span>{project.robotCount} 个机器人</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 新建项目弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl text-slate-900 mb-6">新建项目</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-700 mb-2">项目名称</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入项目名称"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-2">项目描述</label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入项目描述（可选）"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewProjectName('');
                  setNewProjectDesc('');
                }}
                className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateProject}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}