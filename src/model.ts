import { ModelContext, RecentDiff } from './context';
import { normalizeEndpoint } from './helpers/normalizeEndpoint';

export type PromptBuildResult = {
  prompt: string;
  droppedFiles: number;
  droppedDiffs: number;
};

export class PromptBuilder {
  constructor(private maxContextChars: number) { }

  build(context: ModelContext): PromptBuildResult | null {
    const baseParts = [
      `<|file_sep|>original/${context.currentFilePath}`,
      context.originalWindow,
      `<|file_sep|>current/${context.currentFilePath}`,
      context.currentWindow,
      `<|file_sep|>updated/${context.currentFilePath}`,
    ];

    const baseCharCount = baseParts.reduce((sum, part) => sum + part.length + 1, 0);
    if (baseCharCount > this.maxContextChars) {
      return null;
    }

    const availableDiffs = context.recentDiffs.slice();

    const files = context.recentFiles.slice();
    let droppedFiles = 0;
    let droppedDiffs = 0;

    const promptParts: string[] = [];
    let remainingChars = this.maxContextChars - baseCharCount;

    const sortedFiles = files.sort((a, b) => b.timestamp - a.timestamp);
    for (const file of sortedFiles) {
      const fileBlock = [`<|file_sep|>${file.filePath}`, file.content];
      const fileChars = fileBlock.reduce((sum, part) => sum + part.length + 1, 0);
      if (fileChars > remainingChars) {
        droppedFiles += 1;
        continue;
      }
      promptParts.push(...fileBlock);
      remainingChars -= fileChars;
    }

    const sortedDiffs = availableDiffs.sort((a, b) => b.timestamp - a.timestamp);
    const keptDiffs: RecentDiff[] = [];
    for (const diff of sortedDiffs) {
      const diffBlock = [
        `<|file_sep|>${diff.filePath}.diff`,
        'original:',
        diff.original,
        'updated:',
        diff.updated,
      ];
      const diffChars = diffBlock.reduce((sum, part) => sum + part.length + 1, 0);
      if (diffChars > remainingChars) {
        droppedDiffs += 1;
        continue;
      }
      keptDiffs.push(diff);
      promptParts.push(...diffBlock);
      remainingChars -= diffChars;
    }

    promptParts.push(...baseParts);

    return {
      prompt: promptParts.join('\n'),
      droppedFiles,
      droppedDiffs,
    };
  }
}

export class ModelClient {
  constructor(private endpoint: string, private model: string) { }

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    const endpoint = normalizeEndpoint(this.endpoint);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        max_tokens: 128,
        temperature: 0,
        stop: ['<|file_sep|>', '</s>'],
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Model request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ text?: string; message?: { content?: string } }>;
    };
    const choice = data.choices?.[0];
    return choice?.text ?? choice?.message?.content ?? '';
  }
}
