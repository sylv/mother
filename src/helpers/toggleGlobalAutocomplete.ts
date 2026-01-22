import * as vscode from 'vscode';
import { CONFIG_SECTION } from './readConfig';

export async function toggleGlobalAutocomplete() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const enabled = config.get<boolean>('enabled', true);
  await config.update('enabled', !enabled, vscode.ConfigurationTarget.Global);
}
