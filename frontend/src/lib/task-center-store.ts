import { create } from 'zustand'

export type TaskCenterTaskType = 'report-review' | 'bank-recon' | 'detail-test'
export type TaskCenterTaskStatus = 'running' | 'completed'

export interface TaskCenterTask {
  id: string
  type: TaskCenterTaskType
  title: string
  subject: string
  status: TaskCenterTaskStatus
  submittedAt: string
  completedAt?: string
  unread?: boolean
  summary: string
  completedSummary?: string
  metrics: Array<{ label: string; value: string }>
  resultMode?: 'report-review' | 'detail-test' | 'summary'
  autoCompleteAt?: number
}

interface TaskCenterState {
  tasks: TaskCenterTask[]
  ensureSeedTasks: () => void
  startTask: (task: Omit<TaskCenterTask, 'id' | 'submittedAt' | 'status' | 'unread'> & { durationMs?: number }) => string
  markRead: (id: string) => void
  syncTasks: () => void
}

const STATIC_TASKS: TaskCenterTask[] = [
  {
    id: 'bank-recon-demo',
    type: 'bank-recon',
    title: '银行流水双向核对',
    subject: '乙公司（服饰制造） · 2025',
    status: 'completed',
    submittedAt: '2026-07-05 16:10:22',
    completedAt: '2026-07-05 16:16:05',
    summary: '已完成银行流水与账面双向核对，生成异常清单与待人工确认事项。',
    completedSummary: '已完成银行流水与账面双向核对，生成异常清单与待人工确认事项。',
    metrics: [
      { label: '核对项', value: '184' },
      { label: '异常', value: '9' },
      { label: '待人工确认', value: '3' },
    ],
    resultMode: 'summary',
  },
]

function fmt(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

export const useTaskCenter = create<TaskCenterState>((set, get) => ({
  tasks: [...STATIC_TASKS],

  ensureSeedTasks: () => {
    const tasks = get().tasks
    if (tasks.length === 0) set({ tasks: [...STATIC_TASKS] })
  },

  startTask: (task) => {
    const now = Date.now()
    const id = `${task.type}-${now}`
    const durationMs = task.durationMs ?? 6000
    const next: TaskCenterTask = {
      ...task,
      id,
      status: 'running',
      unread: false,
      submittedAt: fmt(now),
      autoCompleteAt: now + durationMs,
    }
    set((state) => ({ tasks: [next, ...state.tasks] }))
    return id
  },

  markRead: (id) => set((state) => ({
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, unread: false } : t)),
  })),

  syncTasks: () => set((state) => ({
    tasks: state.tasks.map((t) => {
      if (t.status === 'running' && t.autoCompleteAt && t.autoCompleteAt <= Date.now()) {
        return {
          ...t,
          status: 'completed',
          unread: true,
          completedAt: fmt(t.autoCompleteAt),
          summary: t.completedSummary || t.summary,
          autoCompleteAt: undefined,
        }
      }
      return t
    }),
  })),
}))
