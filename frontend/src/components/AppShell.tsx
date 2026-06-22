import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  Home, BookOpen, Search, ClipboardList, Bot, Plug, Sparkles, Target,
  Inbox, PanelLeftClose, PanelLeftOpen, FolderOpen, FileCheck2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { zh } from '@/locales/zh'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: any
  demo?: boolean
}
type NavSection = { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: '我的工作',
    items: [
      { to: '/', label: zh.nav.home, icon: Home },
      { to: '/workbench', label: zh.nav.workbench, icon: ClipboardList, demo: true },
      { to: '/archive', label: zh.nav.archive, icon: FolderOpen, demo: true },
      { to: '/special-audit', label: zh.nav.specialAudit, icon: Target, demo: true },
    ],
  },
  {
    title: '知识 & 智能体',
    items: [
      { to: '/knowledge', label: zh.nav.knowledge, icon: BookOpen, demo: true },
      { to: '/agents', label: zh.nav.agents, icon: Bot, demo: true },
    ],
  },
  {
    title: '管理 / 复核',
    items: [
      { to: '/report-review', label: zh.nav.reportReview, icon: FileCheck2, demo: true },
      { to: '/explorer', label: zh.nav.explorer, icon: Search },
      { to: '/learning-inbox', label: zh.nav.learningInbox, icon: Inbox, demo: true },
      { to: '/mcp', label: zh.nav.mcp, icon: Plug },
      { to: '/scenarios', label: zh.nav.scenarios, icon: Sparkles },
    ],
  },
]

export default function AppShell() {
  const loc = useLocation()
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health })

  // —— 全局导航栏 收起 / 展开（持久化）——
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('appshell-collapsed') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('appshell-collapsed', collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  return (
    <div className="min-h-full flex bg-slate-50">
      {/* Sidebar */}
      <aside
        className={cn(
          'shrink-0 bg-slate-900 text-slate-200 flex flex-col transition-[width] duration-200',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        {/* Brand + collapse toggle */}
        <div className={cn('flex items-center gap-2', collapsed ? 'px-2 pt-4 pb-3 justify-center flex-col' : 'px-5 pt-6 pb-5')}>
          {collapsed ? (
            <>
              <div className="h-8 w-8 rounded-md bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center text-white font-bold shrink-0">本</div>
              <button
                onClick={() => setCollapsed(false)}
                className="mt-2 p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                title="展开导航"
              >
                <PanelLeftOpen size={14} />
              </button>
            </>
          ) : (
            <>
              <div className="h-8 w-8 rounded-md bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center text-white font-bold shrink-0">本</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white tracking-wide truncate">{zh.brand}</div>
                <div className="text-[10px] text-slate-400 tracking-widest truncate">{zh.brandSub}</div>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
                title="收起导航"
              >
                <PanelLeftClose size={14} />
              </button>
            </>
          )}
        </div>

        <nav className={cn('flex-1 flex flex-col overflow-y-auto pb-4', collapsed ? 'px-1.5 gap-3' : 'px-3 gap-3')}>
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              {!collapsed && (
                <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {sec.title}
                </div>
              )}
              {collapsed && (
                <div className="border-t border-slate-800/60 mb-1 mx-2" />
              )}
              <div className="flex flex-col gap-0.5">
                {sec.items.map(({ to, label, icon: I, demo }) => {
                  const active = to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to)
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      title={collapsed ? label : undefined}
                      className={cn(
                        'group flex items-center h-9 rounded-md text-sm transition-colors',
                        collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                        active
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                      )}
                    >
                      <I size={16} className={cn(demo && !active && 'text-brand-300')} />
                      {!collapsed && (
                        <>
                          <span>{label}</span>
                          {demo && (
                            <span className="ml-auto text-[9px] uppercase tracking-widest text-brand-300">demo</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: health */}
        <div className={cn('border-t border-slate-800/70 text-[11px] text-slate-400', collapsed ? 'p-2' : 'p-3')}>
          {collapsed ? (
            <div className="flex justify-center" title={health ? `已连接 · ${health.model}` : '后端未连接'}>
              <span className={cn(
                'inline-block h-2 w-2 rounded-full',
                health ? 'bg-emerald-400' : 'bg-slate-600',
              )} />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'inline-block h-2 w-2 rounded-full',
                  health ? 'bg-emerald-400' : 'bg-slate-600',
                )} />
                <span>{health ? '已连接后端' : '后端未连接'}</span>
              </div>
              {health && (
                <div className="mt-1">
                  模型：{health.model}
                  {health.llm_demo_mode && <span className="ml-1 text-amber-300">(演示)</span>}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
