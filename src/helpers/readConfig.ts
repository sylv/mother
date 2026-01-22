import * as vscode from 'vscode';

export type ExtensionConfig = {
  enabled: boolean;
  disabledLanguages: string[];
  endpoint: string;
  model: string;
  maxContextChars: number;
  maxRecentDiffs: number;
  maxRecentFiles: number;
  maxCurrentFileChars: number;
};

export const CONFIG_SECTION = 'mother';
const DEFAULT_CONTEXT_CHARS = 8192 * 4;

export function readConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enabled: config.get('enabled', true),
    endpoint: config.get('endpoint', 'http://127.0.0.1:11434/v1'),
    model: config.get('model', 'sweep-next-edit-1.5B'),
    disabledLanguages: config.get('disabledLanguages', []),
    maxContextChars: config.get('maxContextChars', DEFAULT_CONTEXT_CHARS),
    maxRecentDiffs: config.get('maxRecentDiffs', 8),
    maxRecentFiles: config.get('maxRecentFiles', 4),
    maxCurrentFileChars: config.get('maxCurrentFileChars', 20000),
  };
}
