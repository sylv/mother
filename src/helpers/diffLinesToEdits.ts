export type LineEdit = {
  startLine: number;
  endLineExclusive: number;
  newLines: string[];
};

export function diffLinesToEdits(currentLines: string[], predictedLines: string[]): LineEdit[] {
  const m = currentLines.length;
  const n = predictedLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (currentLines[i - 1] === predictedLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  type Op = { type: 'equal' | 'add' | 'del'; line: string };
  const ops: Op[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && currentLines[i - 1] === predictedLines[j - 1]) {
      ops.push({ type: 'equal', line: currentLines[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', line: predictedLines[j - 1] });
      j -= 1;
    } else if (i > 0) {
      ops.push({ type: 'del', line: currentLines[i - 1] });
      i -= 1;
    }
  }
  ops.reverse();

  const edits: LineEdit[] = [];
  let currentIndex = 0;
  let pendingStart: number | null = null;
  let pendingDeletes = 0;
  let pendingAdds: string[] = [];

  const flush = () => {
    if (pendingStart !== null) {
      edits.push({
        startLine: pendingStart,
        endLineExclusive: pendingStart + pendingDeletes,
        newLines: pendingAdds,
      });
    }
    pendingStart = null;
    pendingDeletes = 0;
    pendingAdds = [];
  };

  for (const op of ops) {
    if (op.type === 'equal') {
      flush();
      currentIndex += 1;
      continue;
    }

    if (pendingStart === null) {
      pendingStart = currentIndex;
    }

    if (op.type === 'del') {
      pendingDeletes += 1;
      currentIndex += 1;
    } else if (op.type === 'add') {
      pendingAdds.push(op.line);
    }
  }
  flush();

  return edits;
}
