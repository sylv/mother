import * as vscode from 'vscode';

export function rangeForLineSpan(
  document: vscode.TextDocument,
  startLine: number,
  endLineExclusive: number,
): vscode.Range {
  const clampedStart = Math.max(0, Math.min(document.lineCount - 1, startLine));
  const clampedEndExclusive = Math.max(clampedStart, Math.min(document.lineCount, endLineExclusive));
  if (clampedEndExclusive === clampedStart) {
    const pos = new vscode.Position(clampedStart, 0);
    return new vscode.Range(pos, pos);
  }
  const endLine = clampedEndExclusive - 1;
  const start = new vscode.Position(clampedStart, 0);
  const end = new vscode.Position(endLine, document.lineAt(endLine).text.length);
  return new vscode.Range(start, end);
}
