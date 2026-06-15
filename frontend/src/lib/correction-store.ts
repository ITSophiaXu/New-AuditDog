import { create } from 'zustand'
import type { CorrectionReasonCode, ProposeDeltaResponse } from './types'

export interface PendingCorrection {
  paperId: number
  fieldPath: string                  // e.g. "summary.book_balance" or "bank_detail.rows[1].confirmation_balance"
  fieldLabel: string                 // human label shown in the modal
  oldValue: any
  newValue?: any                     // optional pre-filled new value (when user already typed)
  agentRunId?: number | null
}

export interface RecentPromote {
  changeId: number
  summary: string
  scope: 'paper' | 'template' | 'firm'
  expiresAt: number                  // epoch ms — toast hides after this
}

interface CorrectionState {
  modal: PendingCorrection | null
  pendingPromote: { correctionId: number; fieldLabel: string; proposal: ProposeDeltaResponse } | null
  recentPromote: RecentPromote | null

  openModal: (p: PendingCorrection) => void
  closeModal: () => void
  setPendingPromote: (v: CorrectionState['pendingPromote']) => void
  setRecentPromote: (v: RecentPromote | null) => void
}

export const useCorrection = create<CorrectionState>((set) => ({
  modal: null,
  pendingPromote: null,
  recentPromote: null,
  openModal: (p) => set({ modal: p }),
  closeModal: () => set({ modal: null }),
  setPendingPromote: (v) => set({ pendingPromote: v }),
  setRecentPromote: (v) => set({ recentPromote: v }),
}))

/** Read paper.data.ai_written_paths into a Set for fast lookup. */
export function aiPathSet(paperData: any): Set<string> {
  return new Set<string>(paperData?.ai_written_paths || [])
}
