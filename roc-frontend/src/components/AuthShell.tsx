import type { ReactNode } from 'react';
import { ArrowLeft, Check, MapPinned, RadioTower, Route, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PublicBrand } from './PublicBrand';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

const steps = [
  { label: '建立项目空间', icon: MapPinned },
  { label: '接入地图与车辆', icon: Route },
  { label: '掌握实时运行状态', icon: RadioTower },
];

export function AuthShell({ eyebrow, title, description, children, footer }: AuthShellProps) {
  return (
    <main className="auth-page min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1280px] overflow-hidden rounded-[28px] border border-white/80 bg-white/88 shadow-[0_24px_80px_rgba(28,47,86,.12)] backdrop-blur-xl sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[minmax(0,1.04fr)_minmax(430px,.96fr)]">
        <section className="auth-visual relative hidden overflow-hidden bg-[#2f6bff] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="auth-orb auth-orb-one" />
          <div className="auth-orb auth-orb-two" />
          <div className="relative z-10">
            <PublicBrand inverse />
            <div className="mt-20 max-w-[520px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md">
                <Sparkles className="size-3.5" />
                机器人运营协作空间
              </span>
              <h2 className="mt-6 text-[clamp(2.4rem,4vw,4.4rem)] font-semibold leading-[1.04] tracking-[-0.055em]">
                从地图出发，
                <br />
                看见每一次运行。
              </h2>
              <p className="mt-6 max-w-md text-base leading-7 text-white/72">
                把分散的机器人、地图与状态数据，收拢到清晰、可信的同一个工作现场。
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-12 grid grid-cols-3 gap-3">
            {steps.map(({ label, icon: Icon }, index) => (
              <div key={label} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <Icon className="size-4 text-white/85" />
                  <span className="text-[10px] font-semibold tracking-[0.16em] text-white/45">0{index + 1}</span>
                </div>
                <p className="mt-7 text-xs font-medium text-white/90">{label}</p>
              </div>
            ))}
          </div>

          <div className="auth-signal-card absolute right-[-12px] top-[42%] z-[5] w-[255px] rounded-[22px] border border-white/50 bg-white/92 p-4 text-[#141a28] shadow-[0_24px_70px_rgba(8,30,93,.28)] backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold">实时运行网络</span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-600"><span className="size-1.5 rounded-full bg-emerald-500" />同步中</span>
            </div>
            <div className="relative mt-3 h-24 overflow-hidden rounded-xl bg-[#edf3ff]">
              <svg viewBox="0 0 220 96" className="absolute inset-0 size-full" aria-hidden="true">
                <path d="M-8 78 C38 72 42 28 88 38 S147 91 229 27" fill="none" stroke="#9bb8ff" strokeWidth="2" strokeDasharray="5 5" />
                <circle cx="53" cy="57" r="7" fill="#2f6bff" />
                <circle cx="137" cy="61" r="6" fill="#806bff" />
                <circle cx="190" cy="41" r="5" fill="#17b897" />
              </svg>
              <span className="absolute bottom-2 left-3 text-[9px] font-medium text-[#77829c]">12 台设备在线</span>
            </div>
          </div>
        </section>

        <section className="relative flex items-center justify-center px-5 py-8 sm:px-10 lg:px-16 xl:px-24">
          <Link
            to="/"
            className="absolute left-5 top-5 inline-flex size-10 items-center justify-center rounded-full border border-[#e4e8ef] bg-white text-[#5f6879] transition hover:-translate-x-0.5 hover:border-[#cbd3e0] hover:text-[#111827] sm:left-8 sm:top-8"
            aria-label="返回首页"
          >
            <ArrowLeft className="size-4" />
          </Link>

          <div className="w-full max-w-[430px] pt-12 lg:pt-0">
            <div className="mb-10 lg:hidden"><PublicBrand /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2f6bff]">{eyebrow}</p>
            <h1 className="mt-3 text-[2.15rem] font-semibold leading-tight tracking-[-0.045em] text-[#101522] sm:text-[2.55rem]">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-[#6d7585]">{description}</p>

            <div className="mt-9">{children}</div>

            <div className="mt-8 border-t border-[#e9ecf1] pt-6 text-sm text-[#697181]">{footer}</div>
            <p className="mt-8 flex items-center gap-2 text-xs text-[#969daa]">
              <span className="grid size-4 place-items-center rounded-full bg-[#eaf8f4] text-[#129573]"><Check className="size-2.5" strokeWidth={3} /></span>
              登录信息通过加密连接传输
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export function authErrorMessage(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid username or password')) return '用户名或密码错误，请重新输入';
  if (normalized.includes('username already')) return '该用户名已被使用';
  if (normalized.includes('email already')) return '该邮箱已被注册';
  if (normalized.includes('invitation code') || normalized.includes('invitation_code')) return '邀请码无效、已使用或已撤销';
  if (normalized.includes('failed to fetch') || normalized.includes('network')) return '暂时无法连接服务器，请稍后重试';
  return message;
}
