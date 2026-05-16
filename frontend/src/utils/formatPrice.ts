export function formatPrice(symbol: string | undefined, price: number): string {
  const decimals = symbol?.includes("/") ? 4 : 2;
  return price.toFixed(decimals);
}
