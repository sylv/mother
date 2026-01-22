export const normalizeEndpoint = (endpoint: string) => {
  if (!endpoint.endsWith('/')) endpoint += '/';
  if (!endpoint.endsWith('/completions')) endpoint += 'completions';
  return endpoint;
};
