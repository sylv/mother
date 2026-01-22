import * as vscode from 'vscode';

export function windowTextForRange(document: vscode.TextDocument, range: vscode.Range): string {
  const lines: string[] = [];
  for (let line = range.start.line; line <= range.end.line; line += 1) {
    lines.push(document.lineAt(line).text);
  }
  return lines.join('\n');
}
