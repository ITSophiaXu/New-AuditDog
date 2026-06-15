import { createContext, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsCtx {
  value: string
  setValue: (v: string) => void
}
const Ctx = createContext<TabsCtx | null>(null)

interface TabsProps {
  defaultValue: string
  value?: string
  onValueChange?: (v: string) => void
  children: ReactNode
  className?: string
}

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue)
  const active = value ?? internal
  const setValue = (v: string) => {
    if (onValueChange) onValueChange(v)
    setInternal(v)
  }
  return (
    <Ctx.Provider value={{ value: active, setValue }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  )
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-1 p-1 bg-slate-100/80 rounded-lg', className)}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(Ctx)!
  const active = ctx.value === value
  return (
    <button
      onClick={() => ctx.setValue(value)}
      className={cn(
        'h-7 px-3 rounded-md text-sm transition-colors',
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(Ctx)!
  if (ctx.value !== value) return null
  return <div className={className}>{children}</div>
}
