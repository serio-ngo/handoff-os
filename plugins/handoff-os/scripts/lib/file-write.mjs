const SECRET_PATHS = [
  /\.env$/i,
  /\.env\.(?!example|sample|template|dist|schema)[^/\\]*$/i,
  /(^|[/\\])secrets?[/\\]/i,
];
const SECRET_NAMES = [
  /^credentials?\.(?:json|ya?ml|csv|txt|ini)$/i,
  /\.(?:pem|key|p12|pfx)$/i,
  /^id_(?:rsa|ed25519|ecdsa)/i,
];
const ORG_PATHS = [/(^|[/\\])(?:brand|brand-kit|brand_assets)[/\\]/i];
const ORG_NAMES = [/^(?:org|beneficiar\w*|contacts|donors)\.(?:json|ya?ml|csv|tsv)$/i];

// Test data and the owner's own memory file are allowed to look like the real thing.
const EXEMPT = [
  /(^|[/\\])memory\.md$/i,
  /(^|[/\\])(?:tests?|__tests__|fixtures?)[/\\]/i,
  /(^|[/\\])test-[^/\\]*$/i,
  /\.(?:test|spec)\.[a-z]+$/i,
  /(^|[/\\])(?:temp|tmp|scratchpad)[/\\]/i,
];

const ACCOUNT_NUMBER = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/;

export function judgeWrite(file, content, how = 'a write') {
  const base = file.split(/[/\\]/).pop() || '';
  if (SECRET_PATHS.some((rx) => rx.test(file)) || SECRET_NAMES.some((rx) => rx.test(base))) {
    return `blocked ${how} to ${file} — secret-bearing`;
  }
  if (EXEMPT.some((rx) => rx.test(file))) return null;
  if (ORG_PATHS.some((rx) => rx.test(file)) || ORG_NAMES.some((rx) => rx.test(base))) {
    return `blocked ${how} to ${file} — brand-locked or organisation data`;
  }
  if (ACCOUNT_NUMBER.test(String(content ?? ''))) {
    return `blocked an account number in ${how} to ${file}`;
  }
  return null;
}
