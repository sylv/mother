import * as vscode from 'vscode';

export function warnIfAIFeaturesDisabled(): boolean {
  const config = vscode.workspace.getConfiguration('chat');
  const disabled = config.get('disableAIFeatures', false);
  if (disabled) {
    vscode.window.showWarningMessage(
      'mother: VS Code setting chat.disableAIFeatures is enabled. Inline completions are disabled.',
    );
  }
  return disabled;
}
