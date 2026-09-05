#!/usr/bin/env node

export const FALLBACK_STEPS = ['content:check', 'typecheck', 'build'];

export function resolveSteps(scripts) {
  if (scripts && scripts.verify) return ['verify'];
  return FALLBACK_STEPS.filter((s) => scripts && scripts[s]);
}

export function stepsToCommand(steps) {
  return steps.map((s) => `npm run ${s}`).join(' && ');
}
