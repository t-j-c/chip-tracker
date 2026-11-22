import { cn, getAvatarColor } from '@/lib/utils';

const SIZES = {
  sm: 'h-8 w-8 text-base border-2',
  md: 'h-11 w-11 text-xl border-[3px]',
  lg: 'h-14 w-14 text-2xl border-[3px]',
  xl: 'h-16 w-16 text-3xl border-[3px]',
} as const;

interface AvatarProps {
  name: string;
  colorIndex: number;
  size?: keyof typeof SIZES;
  className?: string;
}

export default function Avatar({ name, colorIndex, size = 'md', className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center rounded-full border-ink font-display leading-none text-ink',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: getAvatarColor(colorIndex) }}
    >
      <span className="absolute left-[18%] top-[12%] h-[22%] w-[32%] -rotate-12 rounded-full bg-white/50" />
      <span className="relative">{initial}</span>
    </span>
  );
}
