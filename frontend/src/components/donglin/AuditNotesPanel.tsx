/** 审计说明区 — 底稿表下方
 *
 *  - 预填：AI 给出的 `audit_conclusion`
 *  - 可手动编辑、追加
 *  - 已确认的异常会自动 append（[已确认 by xx, time] 标签）
 *  - 保存到 WorkingPaper.data.auditor_notes
 */
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, Save, Loader2, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = {
  paperId: number
  paperCode: string
  paperData: any
}

const CURRENT_AUDITOR = '王叙超'  // demo 写死，后续可换登录用户

export default function AuditNotesPanel({ paperId, paperCode, paperData }: Props) {
  const qc = useQueryClient()
  const aiSuggestion: string = paperData?.audit_conclusion || ''
  const savedNotes: string = paperData?.auditor_notes || ''

  // 编辑态：本地 draft；切底稿/外部刷新时同步
  const [draft, setDraft] = useState<string>(savedNotes || aiSuggestion)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  useEffect(() => {
    setDraft(savedNotes || aiSuggestion)
  }, [paperId, savedNotes, aiSuggestion])

  const dirty = draft !== (savedNotes || aiSuggestion)

  async function save() {
    setSaving(true)
    try {
      await api.patchObject(paperId, {
        data: { ...(paperData || {}), auditor_notes: draft },
      })
      await qc.invalidateQueries({ queryKey: ['object', paperId] })
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    } finally {
      setSaving(false)
    }
  }

  function insertAiSuggestion() {
    if (!aiSuggestion) return
    const tag = `\n\n--- AI 建议结论 (${new Date().toLocaleDateString('zh-CN')}) ---\n${aiSuggestion}`
    setDraft((d) => (d.trim() ? d + tag : aiSuggestion))
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} className="text-brand-600" />
        <div className="text-sm font-semibold text-slate-900">审计说明</div>
        <div className="text-[11px] text-slate-500">
          {paperCode} · 由 {CURRENT_AUDITOR} 编辑
        </div>
        <div className="ml-auto flex items-center gap-2">
          {aiSuggestion && (
            <Button variant="outline" size="sm" onClick={insertAiSuggestion}>
              <Sparkles size={12} /> 插入 AI 建议
            </Button>
          )}
          <Button
            variant={dirty ? 'primary' : 'outline'}
            size="sm"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? '保存中…' : dirty ? '保存' : '已保存'}
          </Button>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="审计师可在此填写本底稿的审计说明、判断、待办事项；已确认的异常会自动 append。AI 建议结论可通过右上角按钮插入。"
        className={cn(
          'w-full min-h-[150px] p-3 text-[13px] leading-relaxed border border-slate-200 rounded-md',
          'font-sans whitespace-pre-wrap',
          'focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-300',
          dirty && 'bg-amber-50/30',
        )}
        rows={Math.min(Math.max(draft.split('\n').length + 1, 6), 20)}
      />

      <div className="mt-2 flex items-center justify-between text-[10.5px] text-slate-400">
        <span>{draft.length} 字</span>
        <span>
          {savedAt ? `已保存 ${savedAt}` : (savedNotes ? '上次编辑已保存' : '未保存')}
          {' · '}保存到 WorkingPaper.data.auditor_notes
        </span>
      </div>
    </Card>
  )
}

/** 把"已确认的异常"作为一段文本 append 到 notes — 给 AnomalyBanner 调用 */
export function appendAnomalyToNotes(
  current: string,
  anomaly: { title: string; detail: string; severity: string; triggered_by: string },
  reviewer: string = CURRENT_AUDITOR,
): string {
  const ts = new Date().toLocaleString('zh-CN', { hour12: false })
  const block = `
\n📌 异常确认: ${anomaly.title} (${anomaly.severity}级)
  详情：${anomaly.detail}
  触发规则：${anomaly.triggered_by}
  [已确认 by ${reviewer}, ${ts}]\n`
  return (current.trim() ? current : '') + block
}
