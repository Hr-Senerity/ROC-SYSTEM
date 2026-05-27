import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Menu, LogOut, Zap, BarChart3, Settings, Users, User, ChevronDown, Briefcase, Shield } from 'lucide-react';
import { useState } from 'react';

export function HomePage() {
  const { isLoggedIn, logout, role } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleFeatureClick = (feature: string) => {
    if (!isLoggedIn) {
      navigate('/login');
    } else {
      alert(`进入 ${feature} 功能`);
    }
  };

  const features = [
    {
      id: 'analytics',
      title: '数据统计',
      description: '实时数据分析，全面掌握机器人运行状态',
      icon: BarChart3,
      color: 'bg-blue-500'
    },
    {
      id: 'automation',
      title: '自动化配置',
      description: '智能配置系统，快速部署机器人任务',
      icon: Zap,
      color: 'bg-purple-500'
    },
    {
      id: 'team',
      title: '项目管理',
      description: '高效的项目管理工具，轻松管理多个项目',
      icon: Users,
      color: 'bg-green-500'
    },
    {
      id: 'settings',
      title: '多平台部署',
      description: '支持多平台部署，灵活适配不同环境',
      icon: Settings,
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* 导航栏 */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl text-slate-900">ROC平台</span>
              </div>
            </div>

            {/* 桌面端菜单 */}
            <div className="hidden md:flex items-center gap-4">
              {isLoggedIn ? (
                <>
                  <button
                    onClick={() => navigate('/projects')}
                    className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <Briefcase className="w-5 h-5" />
                    工作平台
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-slate-700">个人中心</span>
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* 下拉菜单 */}
                    {userMenuOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setUserMenuOpen(false)}
                        />
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-20">
                          <button
                            onClick={() => {
                              setUserMenuOpen(false);
                              navigate('/profile');
                            }}
                            className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <User className="w-4 h-4" />
                            个人信息
                          </button>
                          <button
                            onClick={() => {
                              setUserMenuOpen(false);
                              navigate('/profile');
                            }}
                            className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Settings className="w-4 h-4" />
                            账户设置
                          </button>
                          {role === 'super_admin' && (
                            <button
                              onClick={() => {
                                setUserMenuOpen(false);
                                navigate('/admin/users');
                              }}
                              className="w-full px-4 py-2 text-left text-purple-600 hover:bg-purple-50 flex items-center gap-2"
                            >
                              <Shield className="w-4 h-4" />
                              用户管理
                            </button>
                          )}
                          <div className="border-t border-slate-200 my-2" />
                          <button
                            onClick={() => {
                              setUserMenuOpen(false);
                              logout();
                            }}
                            className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <LogOut className="w-4 h-4" />
                            退出登录
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    className="px-4 py-2 text-slate-700 hover:text-slate-900 transition-colors"
                  >
                    登录
                  </button>
                  <button
                    onClick={() => navigate('/register')}
                    className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all"
                  >
                    注册
                  </button>
                </>
              )}
            </div>

            {/* 移动端菜单按钮 */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>

          {/* 移动端菜单 */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-slate-200">
              {isLoggedIn ? (
                <>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate('/projects');
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Briefcase className="w-4 h-4" />
                    工作平台
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate('/profile');
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    个人中心
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/login')}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    登录
                  </button>
                  <button
                    onClick={() => navigate('/register')}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    注册
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Hero 区域 */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              {/* 左侧文字内容 */}
              <div className="p-12">
                <div className="inline-block px-4 py-2 bg-blue-50 text-blue-600 rounded-full mb-6">
                  Robot Operation Control Platform
                </div>
                <h1 className="text-4xl md:text-5xl mb-6 text-slate-900">
                  Welcome to <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">ROC Platform</span>
                </h1>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                  一站式机器人运营控制解决方案<br/>
                  助力您的业务快速增长
                </p>
                <div className="flex flex-wrap gap-4">
                  {!isLoggedIn && (
                    <button
                      onClick={() => navigate('/register')}
                      className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-xl transition-all transform hover:scale-105"
                    >
                      立即开始
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/protocols')}
                    className="px-8 py-4 border-2 border-slate-300 text-slate-700 rounded-xl hover:border-blue-500 hover:text-blue-600 transition-all"
                  >
                    协议开放说明
                  </button>
                </div>
              </div>

              {/* 右侧视觉元素 */}
              <div className="relative h-full min-h-[400px] bg-gradient-to-br from-blue-500 to-purple-600 p-12 flex items-center justify-center">
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
                    backgroundSize: '50px 50px'
                  }} />
                </div>
                <div className="relative z-10 text-center">
                  <div className="w-32 h-32 bg-white/20 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-6 transform rotate-12 hover:rotate-0 transition-transform duration-500">
                    <Zap className="w-20 h-20 text-white" />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3 text-white/90">
                      <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                      <span>ROS 协议支持</span>
                    </div>
                    <div className="flex items-center justify-center gap-3 text-white/90">
                      <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <span>ROC 通用协议</span>
                    </div>
                    <div className="flex items-center justify-center gap-3 text-white/90">
                      <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                      <span>JSON 数据交换</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 介绍区域 */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl mb-4 text-slate-900">平台特点</h2>
            <p className="text-slate-600">专业、高效、开放的机器人运营控制平台</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl mb-2 text-slate-900">一站式管理</h3>
              <p className="text-slate-600">统一管理所有机器人，简化运维流程</p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-xl mb-2 text-slate-900">一站式配置</h3>
              <p className="text-slate-600">灵活的配置系统，满足多样化需求</p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl mb-2 text-slate-900">通用开放协议平台</h3>
              <p className="text-slate-600">支持多种协议，兼容各类机器人</p>
            </div>
          </div>
        </div>
      </section>

      {/* 功能入口区域 */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl mb-4 text-slate-900">核心功能</h2>
            <p className="text-slate-600">点击探索更多功能</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <div
                key={feature.id}
                onClick={() => handleFeatureClick(feature.title)}
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer transform hover:scale-105"
              >
                <div className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center mb-4`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl mb-2 text-slate-900">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl text-white">ROC平台</span>
          </div>
          <p>© 2025 ROC平台. 保留所有权利.</p>
        </div>
      </footer>
    </div>
  );
}