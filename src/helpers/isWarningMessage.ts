export function isWarningMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes('disabled') || lowered.includes('snoozed');
}
