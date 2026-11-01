/** "5 hours" up to two days, then "3 days" (same wording as the API's briefing). */
export function durationText(hours: number): string {
  return hours > 48 ? `${Math.floor(hours / 24)} days` : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** "1 item", "4 items". */
export function itemCount(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}
