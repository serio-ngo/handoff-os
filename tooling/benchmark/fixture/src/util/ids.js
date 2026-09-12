let counter = 0;

export function nextId(prefix = 'id') {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function isValidId(id) {
  return /^[a-z]+-\d+$/.test(String(id));
}

export function resetIds() {
  counter = 0;
}
