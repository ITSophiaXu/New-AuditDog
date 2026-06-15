import { Package, Globe, Building2, Wand2, FileText, AlertCircle, CheckCircle2, Archive } from 'lucide-react'
import type { Provenance, ProvenanceOrigin, ProvenanceStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const ORIGIN_META: Record<ProvenanceOrigin, { label: string; cls: string; icon: any }> = {
  base: {
    label: '基础库',
    cls: 'bg-brand-50 text-brand-700 border-brand-200',
    icon: Package,
  },
  public: {
    label: '公共法规',
    cls: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: Globe,
  },
  firm: {
    label: '本所自有',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Building2,
  },
  'customer-derived': {
    label: '案例派生',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: FileText,
  },
  wizard: {
    label: '向导导入',
    cls: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: Wand2,
  },
}

const STATUS_META: Record<ProvenanceStatus, { label: string; cls: string; icon: any } | null> = {
  active: null,
  draft: {
    label: '草稿',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: AlertCircle,
  },
  superseded: {
    label: '已废止',
    cls: 'bg-slate-100 text-slate-500 border-slate-200',
    icon: Archive,
  },
  deprecated: {
    label: '已弃用',
    cls: 'bg-slate-100 text-slate-500 border-slate-200',
    icon: Archive,
  },
}

interface Props {
  p: Provenance | undefined | null
  compact?: boolean
  showBundle?: boolean
  showIssuer?: boolean
  showVersion?: boolean
  className?: string
}

export function ProvenancePill({
  p,
  compact = false,
  showBundle = true,
  showIssuer = false,
  showVersion = true,
  className,
}: Props) {
  if (!p) return null
  const meta = ORIGIN_META[p.origin] ?? ORIGIN_META.firm
  const status = STATUS_META[p.status]
  const Icon = meta.icon

  return (
    <div className={cn('inline-flex items-center gap-1.5 flex-wrap', className)}>
      <span className={cn(
        'inline-flex items-center gap-1 px-2 h-5 rounded-full border text-[11px] font-medium',
        meta.cls,
      )}>
        <Icon size={10} />
        {meta.label}
      </span>
      {showIssuer && p.issuer && (
        <span className="text-[11px] text-slate-600">{p.issuer}</span>
      )}
      {showBundle && p.bundle && (
        <span className="text-[10px] text-slate-500 font-mono">{p.bundle}</span>
      )}
      {showVersion && p.version && (
        <span className="text-[10px] text-slate-400">v{p.version}</span>
      )}
      {status && (
        <span className={cn(
          'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px]',
          status.cls,
        )}>
          <status.icon size={9} />
          {status.label}
        </span>
      )}
      {!compact && p.anonymized_from && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500" title={p.anonymized_from}>
          <CheckCircle2 size={9} className="text-emerald-500" /> 已脱敏
        </span>
      )}
    </div>
  )
}

/** Detail view used inside a popover / drawer. Verbose. */
export function ProvenanceDetail({ p }: { p: Provenance | undefined | null }) {
  if (!p) return <div className="text-xs text-slate-500">无 provenance 信息</div>
  const meta = ORIGIN_META[p.origin] ?? ORIGIN_META.firm
  return (
    <div className="text-xs space-y-1.5">
      <Row k="来源" v={meta.label} />
      <Row k="知识包" v={p.bundle || '—'} mono />
      <Row k="版本" v={p.version ? `v${p.version}` : '—'} />
      <Row k="出处" v={p.issuer || '—'} />
      <Row k="状态" v={p.status} />
      {p.effective_from && <Row k="生效" v={p.effective_from} />}
      {p.author && <Row k="作者" v={p.author} />}
      {p.anonymized_from && <Row k="脱敏自" v={p.anonymized_from} />}
      {p.contributed_by && p.contributed_by.length > 0 && (
        <Row k="贡献来源" v={p.contributed_by.join(', ')} mono />
      )}
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-400 w-16 shrink-0">{k}</span>
      <span className={cn('text-slate-800', mono && 'font-mono text-[11px]')}>{v}</span>
    </div>
  )
}
