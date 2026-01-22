import * as vscode from 'vscode';

export async function openTextInNewTab(language: string, content: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({ language, content });
  await vscode.window.showTextDocument(document, { preview: false });
}
