import * as vscode from 'vscode';
import { ContextTracker, FILE_WINDOW_ABOVE, FILE_WINDOW_BELOW } from './context';
import { diffLinesToEdits } from './helpers/diffLinesToEdits';
import { getContextSnapshot } from './helpers/getContextSnapshot';
import { openTextInNewTab } from './helpers/openTextInNewTab';
import { rangeForLineSpan } from './helpers/rangeForLineSpan';
import { CONFIG_SECTION, readConfig } from './helpers/readConfig';
import { toggleGlobalAutocomplete } from './helpers/toggleGlobalAutocomplete';
import { toggleLanguageAutocomplete } from './helpers/toggleLanguageAutocomplete';
import { truncateForLog } from './helpers/truncateForLog';
import { warnIfAIFeaturesDisabled } from './helpers/warnIfAIFeaturesDisabled';
import { windowRangeForPosition } from './helpers/windowRangeForPosition';
import { windowTextForRange } from './helpers/windowTextForRange';
import { ModelClient, PromptBuilder } from './model';
import {
  clearStatusError,
  createStatusBar,
  setStatusError,
  setStatusState,
  updateStatusBar,
} from './statusbar';

const normalizeIndentation = (lines: string[], editor: vscode.TextEditor): string[] => {
  if (editor.options.insertSpaces !== true) {
    return lines;
  }
  const tabSizeOption = editor.options.tabSize;
  const tabSize = typeof tabSizeOption === 'number' ? tabSizeOption : 4;
  const tabReplacement = ' '.repeat(tabSize);
  return lines.map((line) => {
    const match = line.match(/^[\t ]+/);
    if (!match) {
      return line;
    }
    const leading = match[0];
    const normalizedLeading = leading.replace(/\t/g, tabReplacement);
    return normalizedLeading + line.slice(leading.length);
  });
};

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('mother');
  const config = readConfig();

  const tracker = new ContextTracker(config.maxRecentDiffs, config.maxRecentFiles);

  const statusBar = createStatusBar();

  const statusInputs = (editor: vscode.TextEditor | undefined) => {
    const snapshot = readConfig();
    const languageId = editor?.document.languageId ?? 'unknown';
    return {
      enabled: snapshot.enabled,
      disabledForLanguage: snapshot.disabledLanguages.includes(languageId),
      languageId,
    };
  };

  context.subscriptions.push(output, statusBar);
  output.appendLine('[mother] Extension activated.');
  if (warnIfAIFeaturesDisabled()) {
    setStatusError(context, 'VS Code AI features disabled');
    updateStatusBar(statusBar, context, statusInputs(vscode.window.activeTextEditor));
  }

  vscode.workspace.textDocuments.forEach((document) => tracker.trackDocumentOpen(document));
  tracker.trackVisibleEditors(vscode.window.visibleTextEditors);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => tracker.trackDocumentOpen(document)),
    vscode.workspace.onDidChangeTextDocument((event) => tracker.trackDocumentChange(event)),
    vscode.workspace.onDidCloseTextDocument((document) => tracker.trackDocumentClose(document)),
  );

  let inFlightController: AbortController | null = null;
  let lastActiveEditor = vscode.window.activeTextEditor;
  let lastActiveAt = Date.now();

  const requestPrediction = async (editor: vscode.TextEditor, reason: string) => {
    if (inFlightController) {
      return;
    }
    const activeConfig = readConfig();
    if (!activeConfig.endpoint || !activeConfig.model) {
      vscode.window.showWarningMessage('mother: Configure endpoint and model before requesting predictions.');
      return;
    }

    const document = editor.document;
    if (document.uri.scheme !== 'file') {
      return;
    }
    const fileText = document.getText();
    if (fileText.length > activeConfig.maxCurrentFileChars) {
      vscode.window.showWarningMessage('mother: Current file is too large for next-edit predictions.');
      return;
    }

    const contextSnapshot = tracker.snapshotForEditor(editor);
    if (!contextSnapshot) {
      return;
    }

    const builder = new PromptBuilder(activeConfig.maxContextChars);
    const promptResult = builder.build(contextSnapshot);
    if (!promptResult) {
      output.appendLine('[mother] Not enough context to build a prompt yet.');
      return;
    }

    inFlightController = new AbortController();
    output.appendLine(`[mother] Requesting prediction (${reason}).`);
    output.appendLine(`[mother] Context trimmed: ${promptResult.droppedFiles} files, ${promptResult.droppedDiffs} diffs dropped.`);

    try {
      const client = new ModelClient(activeConfig.endpoint, activeConfig.model);
      const completion = await client.complete(promptResult.prompt, inFlightController.signal);
      output.appendLine('[mother] Prediction result:');
      output.appendLine(completion || '(empty)');
    } catch (error) {
      output.appendLine(`[mother] Prediction failed: ${String(error)}`);
    } finally {
      inFlightController = null;
    }
  };

  const disposable = vscode.commands.registerCommand('mother.predictNextEdit', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    await requestPrediction(editor, 'command');
  });

  const dumpContextCommand = vscode.commands.registerCommand('mother.dumpContext', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const contextSnapshot = getContextSnapshot(editor, tracker, output, readConfig());
    if (!contextSnapshot) {
      return;
    }
    const content = JSON.stringify(contextSnapshot, null, 2);
    await openTextInNewTab('json', content);
    vscode.window.showInformationMessage('mother: context snapshot opened in a new tab.');
  });

  const dumpPromptCommand = vscode.commands.registerCommand('mother.dumpPrompt', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const activeConfig = readConfig();
    const contextSnapshot = getContextSnapshot(editor, tracker, output, activeConfig);
    if (!contextSnapshot) {
      return;
    }
    const builder = new PromptBuilder(activeConfig.maxContextChars);
    const promptResult = builder.build(contextSnapshot);
    if (!promptResult) {
      output.appendLine('[mother] Not enough context to build a prompt yet.');
      return;
    }
    await openTextInNewTab('markdown', promptResult.prompt);
    vscode.window.showInformationMessage('mother: prompt opened in a new tab.');
  });

  const dumpPromptWithCompletionCommand = vscode.commands.registerCommand('mother.dumpPromptWithCompletion', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const activeConfig = readConfig();
    if (!activeConfig.endpoint || !activeConfig.model) {
      vscode.window.showWarningMessage('mother: Configure endpoint and model before requesting predictions.');
      return;
    }
    const contextSnapshot = getContextSnapshot(editor, tracker, output, activeConfig);
    if (!contextSnapshot) {
      return;
    }
    const builder = new PromptBuilder(activeConfig.maxContextChars);
    const promptResult = builder.build(contextSnapshot);
    if (!promptResult) {
      output.appendLine('[mother] Not enough context to build a prompt yet.');
      return;
    }

    try {
      const client = new ModelClient(activeConfig.endpoint, activeConfig.model);
      const completion = await client.complete(promptResult.prompt);
      const needsNewline = promptResult.prompt.length > 0 && !promptResult.prompt.endsWith('\n');
      const merged = `${promptResult.prompt}${needsNewline ? '\n' : ''}${completion ?? ''}`;
      await openTextInNewTab('markdown', merged);
      vscode.window.showInformationMessage('mother: prompt with completion opened in a new tab.');
    } catch (error) {
      output.appendLine(`[mother] Dump prompt with completion failed: ${String(error)}`);
      vscode.window.showWarningMessage(`mother: ${String(error)}`);
    }
  });

  const inlineProvider = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, {
    provideInlineCompletionItems: async (document, position, _inlineContext, token) => {
      output.appendLine('[mother] Inline completion requested.');
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
        output.appendLine('[mother] Skipping: no active editor match.');
        return [];
      }

      if (inFlightController) {
        output.appendLine('[mother] Skipping: request already in flight.');
        return [];
      }

      const activeConfig = readConfig();
      if (!activeConfig.enabled) {
        output.appendLine('[mother] Skipping: disabled globally.');
        setStatusError(context, 'Disabled globally');
        updateStatusBar(statusBar, context, statusInputs(editor));
        return [];
      }
      if (activeConfig.disabledLanguages.includes(document.languageId)) {
        output.appendLine('[mother] Skipping: disabled for language.');
        setStatusError(context, `Disabled for ${document.languageId}`);
        updateStatusBar(statusBar, context, statusInputs(editor));
        return [];
      }
      if (!activeConfig.endpoint || !activeConfig.model) {
        output.appendLine('[mother] Skipping: missing endpoint or model.');
        setStatusError(context, 'Missing endpoint or model');
        updateStatusBar(statusBar, context, statusInputs(editor));
        return [];
      }

      if (document.getText().length > activeConfig.maxCurrentFileChars) {
        vscode.window.showWarningMessage('mother: Current file is too large for next-edit predictions.');
        output.appendLine('[mother] Skipping: file too large.');
        return [];
      }

      const contextSnapshot = tracker.snapshotForEditor(editor);
      if (!contextSnapshot) {
        output.appendLine('[mother] Skipping: no context snapshot.');
        return [];
      }

      const builder = new PromptBuilder(activeConfig.maxContextChars);
      const promptResult = builder.build(contextSnapshot);
      if (!promptResult) {
        output.appendLine('[mother] Skipping: insufficient context for prompt.');
        return [];
      }

      inFlightController = new AbortController();
      token.onCancellationRequested(() => inFlightController?.abort());
      setStatusState(context, 'loading');
      updateStatusBar(statusBar, context, statusInputs(editor));

      try {
        const client = new ModelClient(activeConfig.endpoint, activeConfig.model);
        const completion = await client.complete(promptResult.prompt, inFlightController.signal);
        if (!completion) {
          output.appendLine('[mother] Empty completion.');
          setStatusError(context, 'Empty completion');
          updateStatusBar(statusBar, context, statusInputs(editor));
          return [];
        }

        const window = windowRangeForPosition(document, position, FILE_WINDOW_ABOVE, FILE_WINDOW_BELOW);
        const windowText = windowTextForRange(document, window);
        const normalizedCompletion = completion.startsWith('\n') ? completion.slice(1) : completion;
        const currentLines = windowText.split('\n');
        const predictedLines = normalizedCompletion.split('\n');
        const edits = diffLinesToEdits(currentLines, predictedLines);
        const filteredEdits = edits.filter((edit) => {
          const startLine = window.start.line + edit.startLine;
          const endLineExclusive = window.start.line + edit.endLineExclusive;
          return endLineExclusive > position.line || startLine >= position.line;
        });
        if (filteredEdits.length === 0) {
          output.appendLine('[mother] No applicable edits.');
          setStatusState(context, 'idle');
          updateStatusBar(statusBar, context, statusInputs(editor));
          return [];
        }

        const items = filteredEdits.map((edit) => {
          const startLine = window.start.line + edit.startLine;
          const endLineExclusive = window.start.line + edit.endLineExclusive;
          const range = rangeForLineSpan(document, startLine, endLineExclusive);
          const normalizedLines = normalizeIndentation(edit.newLines, editor);
          const insertText = normalizedLines.join('\n');
          return new vscode.InlineCompletionItem(insertText, range);
        });

        output.appendLine(`[mother] Completion length: ${completion.length}`);
        output.appendLine(`[mother] Completion preview: ${truncateForLog(completion, 400)}`);
        output.appendLine(`[mother] Window length: ${windowText.length}`);
        output.appendLine(`[mother] Edits generated: ${edits.length}, after/overlapping cursor: ${filteredEdits.length}`);
        edits.slice(0, 5).forEach((edit, index) => {
          output.appendLine(`[mother] Edit ${index + 1}: lines ${edit.startLine}-${edit.endLineExclusive}, insert ${truncateForLog(edit.newLines.join('\\n'), 200)}`);
        });
        clearStatusError(context);
        setStatusState(context, 'idle');
        updateStatusBar(statusBar, context, statusInputs(editor));
        output.appendLine('[mother] Completion provided.');
        return items;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          output.appendLine('[mother] Request aborted.');
          setStatusState(context, 'idle');
          updateStatusBar(statusBar, context, statusInputs(editor));
          return [];
        }
        setStatusError(context, String(error));
        updateStatusBar(statusBar, context, statusInputs(editor));
        vscode.window.showWarningMessage(`mother: ${String(error)}`);
        output.appendLine(`[mother] Inline prediction failed: ${String(error)}`);
        return [];
      } finally {
        inFlightController = null;
      }
    },
  });

  const toggleStatus = vscode.commands.registerCommand('mother.toggleStatus', async () => {
    const editor = vscode.window.activeTextEditor;
    const languageId = editor?.document.languageId ?? 'unknown';
    const globalEnabled = readConfig().enabled;
    const languageDisabled = readConfig().disabledLanguages.includes(languageId);
    const items: vscode.QuickPickItem[] = [
      {
        label: globalEnabled ? 'Disable globally' : 'Enable globally',
        description: 'Toggle inline completions for all files.',
      },
      {
        label: languageDisabled ? `Enable for ${languageId}` : `Disable for ${languageId}`,
        description: 'Toggle inline completions for this language.',
      },
    ];
    const selection = await vscode.window.showQuickPick(items, { placeHolder: 'mother' });
    if (!selection) {
      return;
    }
    if (selection.label.includes('globally')) {
      await toggleGlobalAutocomplete();
    } else {
      await toggleLanguageAutocomplete(languageId);
    }
    clearStatusError(context);
    updateStatusBar(statusBar, context, statusInputs(editor));
  });

  const toggleGlobalCommand = vscode.commands.registerCommand('mother.toggleGlobalAutocomplete', async () => {
    await toggleGlobalAutocomplete();
    updateStatusBar(statusBar, context, statusInputs(vscode.window.activeTextEditor));
  });

  const toggleLanguageCommand = vscode.commands.registerCommand('mother.toggleLanguageAutocomplete', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    await toggleLanguageAutocomplete(editor.document.languageId);
    updateStatusBar(statusBar, context, statusInputs(editor));
  });

  const editorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    const now = Date.now();
    if (lastActiveEditor) {
      tracker.recordViewedEditor(lastActiveEditor, now - lastActiveAt);
    }
    lastActiveEditor = editor;
    lastActiveAt = now;
    updateStatusBar(statusBar, context, statusInputs(editor));
  });

  const visibleEditorsListener = vscode.window.onDidChangeVisibleTextEditors((editors) => {
    tracker.trackVisibleEditors(editors);
  });

  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(CONFIG_SECTION)) {
      clearStatusError(context);
      updateStatusBar(statusBar, context, statusInputs(vscode.window.activeTextEditor));
      return;
    }
    if (event.affectsConfiguration('chat') || event.affectsConfiguration('chat.disableAIFeatures')) {
      if (warnIfAIFeaturesDisabled()) {
        setStatusError(context, 'VS Code AI features disabled');
      } else {
        clearStatusError(context);
      }
      updateStatusBar(statusBar, context, statusInputs(vscode.window.activeTextEditor));
    }
  });

  updateStatusBar(statusBar, context, statusInputs(vscode.window.activeTextEditor));

  context.subscriptions.push(
    disposable,
    inlineProvider,
    dumpContextCommand,
    dumpPromptCommand,
    dumpPromptWithCompletionCommand,
    toggleStatus,
    toggleGlobalCommand,
    toggleLanguageCommand,
    editorListener,
    visibleEditorsListener,
    configListener,
  );
}

export function deactivate() { }
