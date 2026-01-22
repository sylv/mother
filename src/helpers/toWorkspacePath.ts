import * as vscode from 'vscode';

export function toWorkspacePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false);
}
