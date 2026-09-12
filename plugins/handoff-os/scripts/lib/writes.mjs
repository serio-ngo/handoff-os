import { SECRET_NAMES, SECRET_PATHS } from './patterns.mjs';

export function judgeWrite(file, how = 'a write') {
  const base = file.split(/[/\\]/).pop() || '';
  const secret = SECRET_PATHS.some((rx) => rx.test(file)) || SECRET_NAMES.some((rx) => rx.test(base));
  return secret ? `blocked ${how} to ${file} — secret-bearing` : null;
}
