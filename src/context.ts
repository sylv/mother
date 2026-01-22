import * as vscode from 'vscode';
import { extractWindow } from './helpers/extractWindow';
import { toWorkspacePath } from './helpers/toWorkspacePath';

export type RecentDiff = {
  filePath: string;
  original: string;
  updated: string;
  timestamp: number;
};

export type RecentFile = {
  filePath: string;
  content: string;
  timestamp: number;
};

export type ModelContext = {
  currentFilePath: string;
  originalWindow: string;
  currentWindow: string;
  recentDiffs: RecentDiff[];
  recentFiles: RecentFile[];
};

export const FILE_WINDOW_ABOVE = 10;
export const FILE_WINDOW_BELOW = 10;

export class ContextTracker {
  private recentDiffs: RecentDiff[] = [];
  private recentFiles = new Map<string, RecentFile>();
  private docCache = new Map<string, string>();
  private lastEditSnapshots = new Map<string, { originalText: string; currentText: string; timestamp: number }>();

  constructor(private maxRecentDiffs: number, private maxRecentFiles: number) {}

  trackDocumentOpen(document: vscode.TextDocument) {
    if (document.uri.scheme !== 'file') {
      return;
    }
    const key = document.uri.toString();
    const text = document.getText();
    this.docCache.set(key, text);
    this.recordRecentFile(document, text);
  }

  trackDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const document = event.document;
    if (document.uri.scheme !== 'file') {
      return;
    }
    const key = document.uri.toString();
    const previousText = this.docCache.get(key) ?? document.getText();
    let workingText = previousText;

    for (const change of event.contentChanges) {
      const original = workingText.slice(change.rangeOffset, change.rangeOffset + change.rangeLength);
      const updated = change.text;
      workingText = workingText.slice(0, change.rangeOffset) + updated + workingText.slice(change.rangeOffset + change.rangeLength);
      this.recordRecentDiff(document, original, updated);
    }

    this.docCache.set(key, workingText);
    this.lastEditSnapshots.set(key, { originalText: previousText, currentText: workingText, timestamp: Date.now() });
    this.recordRecentFile(document, workingText);
  }

  snapshotForEditor(editor: vscode.TextEditor): ModelContext | null {
    const document = editor.document;
    if (document.uri.scheme !== 'file') {
      return null;
    }
    const filePath = toWorkspacePath(document.uri);
    const currentText = document.getText();
    const cursorLine = editor.selection.active.line;
    const currentWindow = extractWindow(currentText, cursorLine, FILE_WINDOW_ABOVE, FILE_WINDOW_BELOW);

    const cacheKey = document.uri.toString();
    const lastSnapshot = this.lastEditSnapshots.get(cacheKey);
    const originalText = lastSnapshot?.originalText ?? currentText;
    const originalCursorLine = Math.min(cursorLine, Math.max(0, originalText.split(/\r?\n/).length - 1));
    const originalWindow = extractWindow(originalText, originalCursorLine, FILE_WINDOW_ABOVE, FILE_WINDOW_BELOW);

    const recentDiffs = this.recentDiffs.slice(0, this.maxRecentDiffs);
    const recentFiles = Array.from(this.recentFiles.values())
      .filter((entry) => entry.filePath !== filePath)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.maxRecentFiles);

    return {
      currentFilePath: filePath,
      originalWindow,
      currentWindow,
      recentDiffs,
      recentFiles,
    };
  }

  private recordRecentDiff(document: vscode.TextDocument, original: string, updated: string) {
    const filePath = toWorkspacePath(document.uri);
    this.recentDiffs.unshift({
      filePath,
      original,
      updated,
      timestamp: Date.now(),
    });
    if (this.recentDiffs.length > this.maxRecentDiffs * 2) {
      this.recentDiffs = this.recentDiffs.slice(0, this.maxRecentDiffs * 2);
    }
  }

  private recordRecentFile(document: vscode.TextDocument, content: string) {
    const filePath = toWorkspacePath(document.uri);
    this.recentFiles.set(filePath, {
      filePath,
      content,
      timestamp: Date.now(),
    });
    if (this.recentFiles.size > this.maxRecentFiles * 2) {
      const entries = Array.from(this.recentFiles.values()).sort((a, b) => b.timestamp - a.timestamp);
      this.recentFiles = new Map(entries.slice(0, this.maxRecentFiles * 2).map((entry) => [entry.filePath, entry]));
    }
  }
}
