import * as Icons from 'lucide-react'
import type { ComponentProps } from 'react'

export function Icon({
  name,
  className,
  size = 16,
  ...rest
}: { name: string; size?: number } & Omit<ComponentProps<'svg'>, 'name'>) {
  const fallback = Icons['Box']
  const C = (Icons as any)[name] || fallback
  return <C size={size} className={className} {...rest} />
}
