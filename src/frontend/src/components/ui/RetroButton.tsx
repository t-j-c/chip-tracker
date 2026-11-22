import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const retroButton = cva('retro-btn', {
  variants: {
    tone: {
      tomato: 'bg-tomato text-ink',
      teal: 'bg-teal text-ink',
      royal: 'bg-royal text-paper',
      mustard: 'bg-mustard text-ink',
      grape: 'bg-grape text-paper',
      bubblegum: 'bg-bubblegum text-ink',
      cream: 'bg-card text-ink',
      ink: 'bg-ink text-paper',
    },
    size: {
      sm: 'min-h-10 px-3 text-sm',
      md: 'min-h-12 px-4 text-base',
      lg: 'min-h-14 px-5 text-lg',
      xl: 'min-h-16 px-6 text-xl',
    },
    block: { true: 'w-full', false: '' },
  },
  defaultVariants: { tone: 'cream', size: 'md', block: false },
});

export interface RetroButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof retroButton> {}

export default function RetroButton({ className, tone, size, block, type = 'button', ...props }: RetroButtonProps) {
  return <button type={type} className={cn(retroButton({ tone, size, block }), className)} {...props} />;
}
