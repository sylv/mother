import * as vscode from 'vscode';
import { CONFIG_SECTION } from './readConfig';

export async function toggleLanguageAutocomplete(languageId: string) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const disabled = config.get<string[]>('disabledLanguages', []);
  const next = disabled.includes(languageId)
    ? disabled.filter((id) => id !== languageId)
    : [...disabled, languageId];
  await config.update('disabledLanguages', next, vscode.ConfigurationTarget.Global);
}
