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
  private recentFiles = new Map<string, RecentFile>();
  private docCache = new Map<string, string>();
  private openSnapshots = new Map<string, { filePath: string; content: string; timestamp: number }>();
  private lastEditSnapshots = new Map<string, { originalText: string; currentText: string; timestamp: number }>();
  private recentEditTimestamps = new Map<string, number>();
  private recentViewTimestamps = new Map<string, number>();
  private visibleEditorPaths = new Set<string>();

  constructor(private maxRecentDiffs: number, private maxRecentFiles: number) { }

  trackDocumentOpen(document: vscode.TextDocument) {
    if (document.uri.scheme !== 'file') {
      return;
    }
    const key = document.uri.toString();
    const text = document.getText();
    const filePath = toWorkspacePath(document.uri);
    this.docCache.set(key, text);
    this.openSnapshots.set(key, { filePath, content: text, timestamp: Date.now() });
  }

  trackDocumentClose(document: vscode.TextDocument) {
    if (document.uri.scheme !== 'file') {
      return;
    }
    const key = document.uri.toString();
    this.docCache.delete(key);
    this.openSnapshots.delete(key);
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
      workingText = workingText.slice(0, change.rangeOffset) + change.text + workingText.slice(change.rangeOffset + change.rangeLength);
    }

    this.docCache.set(key, workingText);
    this.lastEditSnapshots.set(key, { originalText: previousText, currentText: workingText, timestamp: Date.now() });
    this.recentEditTimestamps.set(toWorkspacePath(document.uri), Date.now());
    this.recordRecentFile(document, workingText);
  }

  trackVisibleEditors(editors: readonly vscode.TextEditor[]) {
    this.visibleEditorPaths = new Set(
      editors
        .filter((editor) => editor.document.uri.scheme === 'file')
        .map((editor) => toWorkspacePath(editor.document.uri)),
    );
  }

  recordViewedEditor(editor: vscode.TextEditor, durationMs: number) {
    if (durationMs < 5000) {
      return;
    }
    const document = editor.document;
    if (document.uri.scheme !== 'file') {
      return;
    }
    const filePath = toWorkspacePath(document.uri);
    this.recentViewTimestamps.set(filePath, Date.now());
    const text = document.getText();
    this.docCache.set(document.uri.toString(), text);
    this.recordRecentFile(document, text);
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

    const recentDiffs = this.buildOpenDiffs().slice(0, this.maxRecentDiffs);
    const recentFiles = Array.from(this.recentFiles.values())
      .filter((entry) => entry.filePath !== filePath)
      .map((entry) => {
        const editTimestamp = this.recentEditTimestamps.get(entry.filePath) ?? 0;
        const viewTimestamp = this.recentViewTimestamps.get(entry.filePath) ?? 0;
        const lastActivity = Math.max(entry.timestamp, editTimestamp, viewTimestamp);
        const score =
          (entry.filePath === filePath ? 100 : 0) +
          (editTimestamp > 0 ? 1 : 0) +
          (viewTimestamp > 0 ? 1 : 0) +
          (this.visibleEditorPaths.has(entry.filePath) ? 1 : 0);
        return { entry, score, lastActivity };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.lastActivity - a.lastActivity;
      })
      .slice(0, this.maxRecentFiles)
      .map(({ entry }) => entry);

    return {
      currentFilePath: filePath,
      originalWindow,
      currentWindow,
      recentDiffs,
      recentFiles,
    };
  }

  private extractEdit(originalText: string, updatedText: string) {
    if (originalText === updatedText) {
      return null;
    }
    let start = 0;
    const originalLength = originalText.length;
    const updatedLength = updatedText.length;
    const maxStart = Math.min(originalLength, updatedLength);
    while (start < maxStart && originalText[start] === updatedText[start]) {
      start += 1;
    }
    let originalEnd = originalLength - 1;
    let updatedEnd = updatedLength - 1;
    while (originalEnd >= start && updatedEnd >= start && originalText[originalEnd] === updatedText[updatedEnd]) {
      originalEnd -= 1;
      updatedEnd -= 1;
    }
    const originalRangeStart = this.lineStart(originalText, start);
    const originalRangeEnd = this.lineEnd(originalText, Math.max(start, originalEnd + 1));
    const updatedRangeStart = this.lineStart(updatedText, start);
    const updatedRangeEnd = this.lineEnd(updatedText, Math.max(start, updatedEnd + 1));
    const original = originalText.slice(originalRangeStart, originalRangeEnd);
    const updated = updatedText.slice(updatedRangeStart, updatedRangeEnd);
    return { original, updated };
  }

  private lineStart(text: string, index: number) {
    if (index <= 0) {
      return 0;
    }
    const lastNewline = text.lastIndexOf('\n', index - 1);
    return lastNewline === -1 ? 0 : lastNewline + 1;
  }

  private lineEnd(text: string, index: number) {
    if (index < 0) {
      return 0;
    }
    const nextNewline = text.indexOf('\n', index);
    return nextNewline === -1 ? text.length : nextNewline;
  }

  private buildOpenDiffs(): RecentDiff[] {
    const diffs: RecentDiff[] = [];
    for (const [cacheKey, snapshot] of this.openSnapshots.entries()) {
      const currentText = this.docCache.get(cacheKey);
      if (currentText === undefined) {
        continue;
      }
      const edit = this.extractEdit(snapshot.content, currentText);
      if (!edit) {
        continue;
      }
      if (!this.isMeaningfulEdit(edit.original, edit.updated)) {
        continue;
      }
      const timestamp = this.recentEditTimestamps.get(snapshot.filePath) ?? snapshot.timestamp;
      diffs.push({
        filePath: snapshot.filePath,
        original: edit.original,
        updated: edit.updated,
        timestamp,
      });
    }
    return diffs.sort((a, b) => b.timestamp - a.timestamp);
  }

  private isMeaningfulEdit(original: string, updated: string) {
    const normalizedOriginal = original.replace(/\s+/g, '');
    const normalizedUpdated = updated.replace(/\s+/g, '');
    if (original === updated || normalizedOriginal === normalizedUpdated) {
      return false;
    }
    const nonWhitespaceLength = normalizedOriginal.length + normalizedUpdated.length;
    if (nonWhitespaceLength < 5) {
      return false;
    }
    return true;
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
