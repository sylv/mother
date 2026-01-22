import * as vscode from 'vscode';

export function windowRangeForPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
  above: number,
  below: number,
): vscode.Range {
  const startLine = Math.max(0, position.line - above);
  const endLine = Math.min(document.lineCount - 1, position.line + below);
  const start = new vscode.Position(startLine, 0);
  const end = new vscode.Position(endLine, document.lineAt(endLine).text.length);
  return new vscode.Range(start, end);
}
