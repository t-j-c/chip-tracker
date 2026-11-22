export function chipCountForAmount(amount: number, bigBlind: number): number {
  if (amount <= 0) return 0;
  const unit = Math.max(1, bigBlind);
  return Math.min(5, Math.max(1, Math.ceil(Math.log2(amount / unit + 1))));
}
