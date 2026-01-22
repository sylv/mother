import * as vscode from 'vscode';
import { ContextTracker } from '../context';
import { ExtensionConfig } from './readConfig';

export function getContextSnapshot(
  editor: vscode.TextEditor,
  tracker: ContextTracker,
  output: vscode.OutputChannel,
  activeConfig: ExtensionConfig,
): ReturnType<ContextTracker['snapshotForEditor']> | null {
  const document = editor.document;
  if (document.uri.scheme !== 'file') {
    output.appendLine('[mother] Skipping: non-file document.');
    return null;
  }
  if (document.getText().length > activeConfig.maxCurrentFileChars) {
    vscode.window.showWarningMessage('mother: Current file is too large for next-edit predictions.');
    output.appendLine('[mother] Skipping: file too large.');
    return null;
  }
  const contextSnapshot = tracker.snapshotForEditor(editor);
  if (!contextSnapshot) {
    output.appendLine('[mother] Skipping: no context snapshot.');
    return null;
  }
  return contextSnapshot;
}
