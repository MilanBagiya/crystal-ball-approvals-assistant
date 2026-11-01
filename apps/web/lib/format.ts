/** "1 item", "4 items". */
export function itemCount(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}
