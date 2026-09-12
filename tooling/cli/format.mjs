export const num = (n) => Number(n || 0).toLocaleString('en-US');
export const tok = (bytes) => Math.round(bytes / 4);
export const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 10000 ? `${(n / 1000).toFixed(1)}k` : num(n));
export const secs = (ms) => `${Math.round(ms / 1000)}s`;
