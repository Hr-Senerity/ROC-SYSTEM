import { useState } from 'react';
import { BookOpen, Briefcase, ChevronRight, LogOut, Menu, ShieldCheck, User, X, Zap } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all ${isActive
    ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`;

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { role, username, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navigation = (
    <>
      <nav className="flex-1 space-y-1 p-3" aria-label="工作台导航">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">运营工作台</p>
        <NavLink to="/projects" className={navClass} onClick={() => setMobileOpen(false)}>
          <Briefcase className="size-4" aria-hidden="true" />项目工作台
        </NavLink>
        <NavLink to="/protocols" className={navClass} onClick={() => setMobileOpen(false)}>
          <BookOpen className="size-4" aria-hidden="true" />文档指南
        </NavLink>
        {role === 'super_admin' && (
          <div className="pt-5">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-500">平台管理</p>
            <NavLink to="/admin/users" className={navClass} onClick={() => setMobileOpen(false)}>
              <ShieldCheck className="size-4" aria-hidden="true" />平台账户
            </NavLink>
          </div>
        )}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <NavLink to="/profile" className={navClass} onClick={() => setMobileOpen(false)}>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 group-[.bg-blue-600]:bg-white/15 group-[.bg-blue-600]:text-white"><User className="size-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate">{username || '个人中心'}</span><span className="block text-[10px] font-normal opacity-70">{role === 'super_admin' ? '超级管理员' : '普通用户'}</span></span>
          <ChevronRight className="size-3.5 opacity-50" />
        </NavLink>
        <button type="button" onClick={handleLogout} className="mt-1 flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">
          <LogOut className="size-4" aria-hidden="true" />退出登录
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f6f8fc] lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] flex-col border-r border-slate-200/80 bg-white/95 lg:flex">
        <NavLink to="/projects" className="flex h-16 items-center gap-3 border-b border-slate-200/80 px-5 text-slate-950">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200"><Zap className="size-4" /></span>
          <span><span className="block font-semibold">ROC Platform</span><span className="block text-[10px] font-medium uppercase tracking-widest text-slate-400">Operations</span></span>
        </NavLink>
        {navigation}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/40" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <span className="font-semibold">ROC Platform</span>
              <button className="grid size-9 place-items-center rounded-md hover:bg-slate-100" aria-label="关闭导航" onClick={() => setMobileOpen(false)}><X className="size-5" /></button>
            </div>
            {navigation}
          </aside>
        </div>
      )}

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl lg:px-8">
          <button type="button" className="grid size-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="打开导航" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </button>
          <span className="ml-2 text-sm font-medium text-slate-600 lg:ml-0">机器人运营控制工作台</span>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${role === 'super_admin' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600'}`}>{role === 'super_admin' ? '平台管理员视图' : '项目成员视图'}</span>
        </header>
        <main className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
