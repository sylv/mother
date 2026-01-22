import * as vscode from 'vscode';
import { isWarningMessage } from './helpers/isWarningMessage';

export type StatusState = 'idle' | 'loading' | 'error';

type StatusInputs = {
  enabled: boolean;
  disabledForLanguage: boolean;
  languageId: string;
};

const STATUS_KEY = 'mother.status';
const STATUS_ERROR_KEY = 'mother.statusError';

export function createStatusBar(): vscode.StatusBarItem {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 5);
  statusBar.command = 'mother.toggleStatus';
  statusBar.show();
  return statusBar;
}

export function updateStatusBar(
  statusBar: vscode.StatusBarItem,
  context: vscode.ExtensionContext,
  inputs: StatusInputs,
) {
  const status = getStatusState(context);
  const errorMessage = getStatusError(context);
  statusBar.backgroundColor = undefined;

  if (status === 'loading') {
    statusBar.text = '$(loading~spin) mother';
    statusBar.tooltip = 'mother: generating';
    return;
  }
  if (status === 'error' && errorMessage) {
    const isWarning = isWarningMessage(errorMessage);
    statusBar.backgroundColor = new vscode.ThemeColor(
      isWarning ? 'statusBarItem.warningBackground' : 'statusBarItem.errorBackground',
    );
    statusBar.text = '$(error) mother';
    statusBar.tooltip = `mother: ${errorMessage}`;
    return;
  }
  if (!inputs.enabled) {
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBar.text = '$(circle-slash) mother';
    statusBar.tooltip = 'mother: disabled globally';
    return;
  }
  if (inputs.disabledForLanguage) {
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBar.text = '$(circle-slash) mother';
    statusBar.tooltip = `mother: disabled for ${inputs.languageId}`;
    return;
  }

  statusBar.text = '$(sparkle) mother';
  statusBar.tooltip = 'mother: enabled';
}


export function setStatusState(context: vscode.ExtensionContext, status: StatusState) {
  void context.globalState.update(STATUS_KEY, status);
}

export function getStatusState(context: vscode.ExtensionContext): StatusState {
  return context.globalState.get<StatusState>(STATUS_KEY, 'idle');
}

export function setStatusError(context: vscode.ExtensionContext, message: string) {
  void context.globalState.update(STATUS_KEY, 'error');
  void context.globalState.update(STATUS_ERROR_KEY, message);
}

export function clearStatusError(context: vscode.ExtensionContext) {
  void context.globalState.update(STATUS_KEY, 'idle');
  void context.globalState.update(STATUS_ERROR_KEY, undefined);
}

export function getStatusError(context: vscode.ExtensionContext): string | undefined {
  return context.globalState.get<string>(STATUS_ERROR_KEY);
}
