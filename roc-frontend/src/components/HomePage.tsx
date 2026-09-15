import { ArrowRight, Braces, ChevronRight, Download, Github, Map, Radio, Truck } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';
import { PublicBrand } from './PublicBrand';
import { Button } from './ui/button';

const capabilities = [
  { number: '01', icon: Map, title: '一张地图看全局', description: '地图、路网、车辆位置与任务状态保持在同一视口，不再来回切换。' },
  { number: '02', icon: Truck, title: '项目边界更清楚', description: '按项目组织车辆与成员，让每个团队只关注真正相关的运营现场。' },
  { number: '03', icon: Radio, title: '变化及时被看见', description: '持续接收设备状态和数据时间，让异常、离线与恢复都有迹可循。' },
];

export function HomePage() {
  const { status } = useAuth();
  if (status === 'authenticated') return <Navigate to="/projects" replace />;

  return (
    <div className="home-page min-h-screen overflow-hidden bg-[#f7f8f5] text-[#0c111d]">
      <header className="relative z-30 px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="mx-auto flex h-14 max-w-[1220px] items-center justify-between rounded-full border border-black/[.06] bg-white/85 px-3 pl-4 shadow-[0_8px_30px_rgba(20,34,60,.06)] backdrop-blur-xl sm:px-4 sm:pl-5">
          <Link to="/" aria-label="ROC Platform 首页"><PublicBrand compact /></Link>
          <nav className="flex items-center gap-1" aria-label="公开导航">
            <Button variant="ghost" className="hidden h-10 rounded-full px-4 text-[#606979] hover:bg-[#f1f3f6] hover:text-[#101522] sm:inline-flex" asChild>
              <Link to="/guide"><Braces className="size-4" />文档指南</Link>
            </Button>
            <Button variant="ghost" className="hidden h-10 rounded-full px-4 text-[#606979] hover:bg-[#f1f3f6] hover:text-[#101522] md:inline-flex" asChild>
              <a href="https://github.com/Hr-Senerity/ROC-SYSTEM" target="_blank" rel="noreferrer"><Github className="size-4" />GitHub</a>
            </Button>
            <Button variant="outline" className="hidden h-10 rounded-full border-[#d9dfe8] bg-white px-4 text-[#202735] shadow-none hover:border-[#2f6bff]/30 hover:bg-[#eef4ff] hover:text-[#2f6bff] lg:inline-flex" asChild>
              <a href="https://github.com/Hr-Senerity/ROC-SYSTEM" target="_blank" rel="noreferrer"><Download className="size-4" />Download now</a>
            </Button>
            <Button variant="ghost" size="icon" className="size-10 rounded-full text-[#505969] hover:bg-[#f1f3f6] hover:text-[#101522] md:hidden" asChild>
              <a href="https://github.com/Hr-Senerity/ROC-SYSTEM" target="_blank" rel="noreferrer" aria-label="在 GitHub 查看 ROC-SYSTEM"><Github className="size-[18px]" /></a>
            </Button>
            <Button className="h-10 rounded-full bg-[#101522] px-5 text-white shadow-none hover:bg-[#2f6bff]" asChild>
              <Link to="/login">登录工作台<ArrowRight className="size-3.5" /></Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative mx-auto max-w-[1280px] px-5 pb-20 pt-20 text-center sm:px-8 sm:pt-24 lg:pb-28 lg:pt-28">
          <div className="home-ambient home-ambient-one" />
          <div className="home-ambient home-ambient-two" />
          <div className="relative z-10 mx-auto max-w-[940px]">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#dfe5ee] bg-white/80 px-3.5 py-1.5 text-xs font-medium text-[#5f6878] shadow-sm backdrop-blur">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#2f6bff] opacity-40" /><span className="relative inline-flex size-2 rounded-full bg-[#2f6bff]" /></span>
              为机器人运营团队打造
            </p>
            <h1 className="mt-7 text-[clamp(2.75rem,7.2vw,6.4rem)] font-semibold leading-[.97] tracking-[-0.065em] text-[#0b101b]">
              让每台机器人，
              <br />
              都在<span className="home-gradient-text">视野之内。</span>
            </h1>
            <p className="mx-auto mt-7 max-w-[650px] text-base leading-7 text-[#687181] sm:text-lg sm:leading-8">
              ROC 将地图、车辆与实时状态组织成一个清晰的运营现场，让团队更快判断、更少切换、更安心地推进每一次任务。
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button className="h-12 w-full rounded-full bg-[#2f6bff] px-7 text-[15px] text-white shadow-[0_12px_28px_rgba(47,107,255,.24)] hover:-translate-y-0.5 hover:bg-[#245deb] sm:w-auto" asChild>
                <Link to="/register">免费创建账户<ArrowRight className="size-4" /></Link>
              </Button>
              <Button variant="ghost" className="h-12 w-full rounded-full px-7 text-[15px] text-[#3f4858] hover:bg-white hover:text-[#111827] sm:w-auto" asChild>
                <Link to="/login">已有账户，直接进入<ChevronRight className="size-4" /></Link>
              </Button>
            </div>
          </div>

          <div className="home-stage relative z-10 mx-auto mt-16 max-w-[1120px] overflow-hidden rounded-[28px] border border-white/60 bg-[#2f6bff] p-3 shadow-[0_36px_90px_rgba(42,89,195,.22)] sm:mt-20 sm:rounded-[38px] sm:p-5 lg:p-7">
            <div className="home-stage-glow" />
            <div className="relative min-h-[390px] overflow-hidden rounded-[20px] border border-white/15 bg-[#133a9e]/25 text-left sm:min-h-[520px] sm:rounded-[28px]">
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:48px_48px]" />
              <svg viewBox="0 0 1000 520" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
                <defs>
                  <linearGradient id="routeLine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9eeaff" /><stop offset=".52" stopColor="#ffffff" /><stop offset="1" stopColor="#b7a6ff" /></linearGradient>
                  <filter id="routeGlow"><feGaussianBlur stdDeviation="7" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                </defs>
                <path d="M-50 390 C130 360 155 160 340 190 S570 430 745 300 S875 112 1060 145" fill="none" stroke="url(#routeLine)" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 13" filter="url(#routeGlow)" />
                <path d="M48 95 C210 92 230 300 420 306 S680 93 930 410" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="2" />
              </svg>

              <div className="home-map-node left-[13%] top-[62%]"><Truck className="size-4" /></div>
              <div className="home-map-node left-[43%] top-[43%]"><Radio className="size-4" /></div>
              <div className="home-map-node right-[18%] top-[48%]"><Truck className="size-4" /></div>

              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/20 bg-[#102a70]/55 px-3 py-2 text-[10px] font-medium text-white/80 backdrop-blur-md sm:left-6 sm:top-6 sm:text-xs">
                <span className="size-2 rounded-full bg-[#6fffd3] shadow-[0_0_0_5px_rgba(111,255,211,.13)]" />华东仓储项目 · 实时视图
              </div>

              <div className="home-operations-card absolute bottom-4 left-4 right-4 rounded-[20px] border border-white/70 bg-white/94 p-4 shadow-[0_22px_60px_rgba(13,39,105,.28)] backdrop-blur-xl sm:bottom-7 sm:left-auto sm:right-7 sm:w-[360px] sm:rounded-[24px] sm:p-5">
                <div className="flex items-start justify-between">
                  <div><p className="text-[11px] font-medium uppercase tracking-[.14em] text-[#9299a6]">Fleet pulse</p><h2 className="mt-1 text-base font-semibold text-[#141a26]">车辆运行概览</h2></div>
                  <span className="rounded-full bg-[#e9f9f4] px-2.5 py-1 text-[10px] font-semibold text-[#148b6d]">运行稳定</span>
                </div>
                <div className="mt-5 grid grid-cols-3 divide-x divide-[#e6e9ee]">
                  {[['12', '在线'], ['08', '任务中'], ['01', '需关注']].map(([value, label]) => <div key={label} className="px-3 first:pl-0 last:pr-0"><strong className="block text-xl font-semibold tracking-tight text-[#151b28] sm:text-2xl">{value}</strong><span className="mt-1 block text-[10px] text-[#858d9b]">{label}</span></div>)}
                </div>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#eef1f5]"><div className="h-full w-[82%] rounded-full bg-gradient-to-r from-[#2f6bff] to-[#756bff]" /></div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[#e4e7e8] bg-white/55">
          <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:py-28">
            <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:gap-16">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.17em] text-[#2f6bff]">One workspace</p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-.045em] text-[#111722] sm:text-4xl">复杂系统，应该有一个简单入口。</h2>
                <p className="mt-5 max-w-md text-sm leading-7 text-[#717988]">每个模块都围绕现场判断来组织信息，而不是堆叠更多面板。</p>
              </div>
              <div className="grid gap-0 sm:grid-cols-3">
                {capabilities.map(({ number, icon: Icon, title, description }) => (
                  <article key={title} className="group border-t border-[#dfe3e8] py-6 sm:border-l sm:border-t-0 sm:px-6 sm:py-1 first:sm:border-l-0">
                    <div className="flex items-center justify-between"><span className="text-[10px] font-semibold tracking-[.18em] text-[#a0a6b0]">{number}</span><Icon className="size-5 text-[#2f6bff] transition-transform group-hover:-translate-y-1" /></div>
                    <h3 className="mt-8 text-lg font-semibold tracking-[-.02em] text-[#171d29]">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#737b89]">{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e4e7e8] bg-[#f7f8f5]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-5 py-8 text-xs text-[#7f8794] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <PublicBrand compact />
          <div className="flex items-center gap-4"><Link to="/guide" className="transition hover:text-[#2f6bff]">文档指南</Link><a href="https://github.com/Hr-Senerity/ROC-SYSTEM" target="_blank" rel="noreferrer" className="transition hover:text-[#2f6bff]">GitHub</a><span>© 2026 ROC Platform</span></div>
        </div>
      </footer>
    </div>
  );
}
