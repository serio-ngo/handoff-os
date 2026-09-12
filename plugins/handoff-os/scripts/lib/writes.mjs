import { ACCOUNT_NUMBER, FIXTURES, ORG_NAMES, ORG_PATHS, SECRET_NAMES, SECRET_PATHS } from '../patterns.mjs';

export function judgeWrite(file, content, how = 'a write') {
  const base = file.split(/[/\\]/).pop() || '';
  if (SECRET_PATHS.some((rx) => rx.test(file)) || SECRET_NAMES.some((rx) => rx.test(base))) {
    return `blocked ${how} to ${file} — secret-bearing`;
  }
  const exempt = /(^|[/\\])memory\.md$/i.test(file) || FIXTURES.some((rx) => rx.test(file));
  if (!exempt && (ORG_PATHS.some((rx) => rx.test(file)) || ORG_NAMES.some((rx) => rx.test(base)))) {
    return `blocked ${how} to ${file} — brand-locked or organisation data`;
  }
  if (!exempt && ACCOUNT_NUMBER.test(String(content ?? ''))) {
    return `blocked an account number in ${how} to ${file}`;
  }
  return null;
}
