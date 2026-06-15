import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(n: number | null | undefined, currency = 'CNY'): string {
  if (n == null || isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(n))
}

export function shortId(n: number | string | null | undefined, prefix = '#'): string {
  if (n == null) return '—'
  return `${prefix}${n}`
}
