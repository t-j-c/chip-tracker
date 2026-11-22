import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AVATAR_COLORS = [
  '#EF5B3F',
  '#3BB8AE',
  '#F2B632',
  '#F28DB2',
  '#6EC1E4',
  '#9BCB4A',
  '#F38B3C',
  '#B39DDB',
  '#F6B48F',
] as const;

/** Avatar fill for a seat index (position in the table's player list). */
export function getAvatarColor(index: number): string {
  const n = AVATAR_COLORS.length;
  return AVATAR_COLORS[((index % n) + n) % n];
}

/** "$1,234" — the one money format used everywhere. */
export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString()}`;
}
