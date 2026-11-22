export default function PhaseSplash({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[38%] z-30 -translate-x-1/2 -translate-y-1/2">
      <div className="keep-visible-reduced animate-splash flex flex-col items-center">
        <span className="text-outline whitespace-nowrap font-comic text-5xl tracking-wider text-mustard drop-shadow-[4px_4px_0_#1B1718]">{title}</span>
        <span className="-mt-1 whitespace-nowrap rounded-full border-2 border-ink bg-card px-2.5 py-px font-display text-xs uppercase tracking-wide text-ink shadow-hard-sm">{subtitle}</span>
      </div>
    </div>
  );
}
