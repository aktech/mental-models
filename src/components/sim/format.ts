const THIN_SPACE = ' ';

/** "1 240 ms" with a narrow no-break space as the thousands separator. */
export function formatMs(t: number): string {
  const whole = Math.round(t).toString();
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  return `${grouped}${THIN_SPACE}ms`;
}
