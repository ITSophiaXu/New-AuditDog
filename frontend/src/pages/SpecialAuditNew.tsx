import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Target, Sparkles, ChevronLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

const SPECIAL_TYPES = [
  '财务报表审计', '经济责任审计', '基本建设项目竣工决算审计',
  '国企内控有效性评价', '财政专项资金审计', '行政事业单位预算执行审计',
  '政府购买服务审计', '社会组织与公益慈善审计', '清产核资审计',
  '破产清算/重整审计', '股东权益与净资产审计', '高新技术企业认定审计',
  '研发费用加计扣除审计', '税务合规审计', '司法会计鉴定',
  '反舞弊与内部举报审计', '其他专项审计',
] as const

const TRIGGERS = ['监管检查', '举报', '例行', '重大事项', '上级委托'] as const

export default function SpecialAuditNew() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: clients = [] } = useQuery({
    queryKey: ['objects', 'Client'],
    queryFn: () => api.listObjects('Client'),
  })

  const [clientName, setClientName] = useState<string>('')
  const [specialType, setSpecialType] = useState<string>('政府专项资金审计')
  const [trigger, setTrigger] = useState<string>('上级委托')
  const [focus, setFocus] = useState<string>('')
  const [period, setPeriod] = useState<string>('')
  const [teamSize, setTeamSize] = useState<string>('4')
  const [grantAmount, setGrantAmount] = useState<string>('')

  const create = useMutation({
    mutationFn: async () => {
      const caseNo = `SPC-${new Date().getFullYear()}-${String(Date.now()).slice(-3).padStart(3, '0')}`
      const obj = await fetch('/api/ontology/objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_code: 'SpecialAuditCase',
          display_name: `${clientName} · ${specialType}`,
          data: {
            case_no: caseNo,
            client_name: clientName,
            special_type: specialType,
            trigger,
            focus_points: focus,
            period,
            team_size: Number(teamSize) || 0,
            grant_amount: grantAmount ? Number(grantAmount) : undefined,
            status: '规划中',
            plan_sections: {},
            conclusion: '',
          },
        }),
      }).then((r) => r.json())
      return obj
    },
    onSuccess: (obj) => {
      qc.invalidateQueries({ queryKey: ['objects', 'SpecialAuditCase'] })
      nav(`/special-audit/${obj.id}`)
    },
  })

  const canSubmit = !!(clientName && specialType && focus && period)

  return (
    <div className="max-w-3xl mx-auto px-8 py-8 space-y-5">
      <Link to="/special-audit" className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
        <ChevronLeft size={12} /> 返回案例工作台
      </Link>

      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-rose-600 text-white grid place-items-center">
          <Target size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">新建专项审计案例</h1>
          <p className="text-sm text-slate-500 mt-1">
            描述案例背景；接下来 AI 将检索公共法规库 + 历史案例库，起草完整方案。
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-5">
        <Field label="客户" required>
          <select
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">选择被审客户…</option>
            {clients.map((c) => (
              <option key={c.id} value={(c.data as any)?.name}>{(c.data as any)?.name}</option>
            ))}
          </select>
        </Field>

        <Field label="专项类型" required>
          <div className="flex flex-wrap gap-1.5">
            {SPECIAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSpecialType(t)}
                className={cn(
                  'h-8 px-3 rounded-md border text-sm transition-colors',
                  specialType === t
                    ? 'border-rose-400 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="触发原因">
          <div className="flex flex-wrap gap-1.5">
            {TRIGGERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrigger(t)}
                className={cn(
                  'h-8 px-3 rounded-md border text-sm transition-colors',
                  trigger === t
                    ? 'border-brand-400 bg-brand-50 text-brand-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="关键关注点 / 案例背景" required help="用 1-3 句话写明监管来源、可疑点、重点科目。AI 会按这段描述起草方案。">
          <Textarea
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="比如：受市数字经济局委托，对智慧城市新基建专项资金的拨付 / 使用 / 绩效进行专项审计。重点关注 政府采购合规、关联方识别、节余资金处理…"
            rows={5}
          />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <Field label="审计期间" required>
            <Input placeholder="如 2024-01 至 2024-12" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <Field label="团队规模">
            <Input type="number" min={1} value={teamSize} onChange={(e) => setTeamSize(e.target.value)} />
          </Field>
          <Field label="专项资金规模 (¥)">
            <Input type="number" min={0} placeholder="可选" value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} />
          </Field>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center">
          <Badge tone="brand"><Sparkles size={11} /> 下一步：AI 会起草本案方案</Badge>
          <div className="ml-auto flex gap-2">
            <Link to="/special-audit"><Button variant="outline">取消</Button></Link>
            <Button
              variant="primary"
              disabled={!canSubmit || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? '创建中…' : '创建案例并起草方案'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Field({
  label, required, help, children,
}: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-sm font-medium text-slate-800">{label}</label>
        {required && <span className="text-rose-500 text-xs">*</span>}
        {help && <span className="text-[11px] text-slate-400 ml-1">{help}</span>}
      </div>
      {children}
    </div>
  )
}
