import { cn } from '@/lib/utils'
import { initialsFromName } from '../utils/userDisplay'

interface UserPersonBadgeProps {
  nombre: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE: Record<NonNullable<UserPersonBadgeProps['size']>, string> = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
}

export function UserPersonBadge({ nombre, size = 'sm', className }: UserPersonBadgeProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary ring-1 ring-inset ring-primary/15',
        SIZE[size],
        className
      )}
    >
      {initialsFromName(nombre)}
    </span>
  )
}
