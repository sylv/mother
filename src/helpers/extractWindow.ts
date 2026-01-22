export function extractWindow(text: string, cursorLine: number, above: number, below: number): string {
  const lines = text.split(/\r?\n/);
  const start = Math.max(0, cursorLine - above);
  const end = Math.min(lines.length, cursorLine + below + 1);
  return lines.slice(start, end).join('\n');
}
