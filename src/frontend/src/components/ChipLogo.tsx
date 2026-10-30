interface ChipLogoProps {
  subtitle?: string;
}

export default function ChipLogo({ subtitle }: ChipLogoProps) {
  return (
    <div className="flex flex-col items-center gap-1 mb-8">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="#1B5E3B" stroke="#22C55E" strokeWidth="2.5" />
        <circle cx="24" cy="24" r="16" fill="#0F1923" stroke="#22C55E" strokeWidth="1.5" />
        <circle cx="24" cy="24" r="8" fill="#22C55E" />
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <rect
            key={deg}
            x="22"
            y="2"
            width="4"
            height="6"
            rx="2"
            fill="#22C55E"
            transform={`rotate(${deg} 24 24)`}
          />
        ))}
      </svg>
      <h1 className="text-2xl font-bold text-text-primary tracking-tight">
        {subtitle ?? 'Chip Tracker'}
      </h1>
    </div>
  );
}
