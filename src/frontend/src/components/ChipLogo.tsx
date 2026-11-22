import { cn } from '@/lib/utils';

const INK = '#1B1718';
const CREAM = '#F7EBCF';

export function ChipLogoMark({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" className={className}>
      <circle cx="32" cy="32" r="29" fill="#EF5B3F" stroke={INK} strokeWidth="3" />
      {[0, 60, 120, 180, 240, 300].map(deg => (
        <rect
          key={deg}
          x="29"
          y="3.5"
          width="6"
          height="9"
          rx="2"
          fill={CREAM}
          stroke={INK}
          strokeWidth="1.5"
          transform={`rotate(${deg} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="18" fill={CREAM} stroke={INK} strokeWidth="3" />
      <ellipse cx="26.5" cy="29" rx="2.6" ry="4" fill={INK} />
      <ellipse cx="37.5" cy="29" rx="2.6" ry="4" fill={INK} />
      <circle cx="27.3" cy="27.4" r="0.9" fill="#FFFFFF" />
      <circle cx="38.3" cy="27.4" r="0.9" fill="#FFFFFF" />
      <circle cx="22.5" cy="35" r="2.4" fill="#F28DB2" opacity="0.8" />
      <circle cx="41.5" cy="35" r="2.4" fill="#F28DB2" opacity="0.8" />
      <path d="M24.5 36.5 Q32 43.5 39.5 36.5" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface ChipLogoProps {
  subtitle?: string;
  className?: string;
}

export default function ChipLogo({ subtitle, className }: ChipLogoProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div aria-hidden="true" className="relative grid h-24 w-24 place-items-center">
        <div className="sunburst animate-spin-slow absolute inset-0 rounded-full border-[3px] border-ink shadow-hard" />
        <ChipLogoMark size={68} className="relative" />
      </div>
      <h1 className="text-outline font-display text-5xl uppercase leading-none tracking-wide text-paper drop-shadow-[4px_4px_0_#1B1718]">
        {subtitle ?? 'Deal Me In'}
      </h1>
    </div>
  );
}
