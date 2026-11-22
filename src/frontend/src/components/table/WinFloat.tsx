import { formatMoney } from '@/lib/utils';

export default function WinFloat({ amount }: { amount: number }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -top-7 left-1/2 z-40 -translate-x-1/2">
      <span data-amount={`+${formatMoney(amount)}`} className="win-float keep-visible-reduced animate-float-up text-outline block whitespace-nowrap font-comic text-3xl tracking-wider text-mustard" />
    </span>
  );
}
