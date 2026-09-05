#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = [
  ["plugins/handoff-os", /\.(md|mjs|json)$/],
  ["settings", /\.json$/],
  ["config", /^org\.example\.json$/],
];
const GENERATED = ["plugins/handoff-os/org.json"];

const walk = (dir, base) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory() ? walk(path.join(dir, entry.name), `${base}/${entry.name}`) : [`${base}/${entry.name}`]
));

export function contentHash(root = REPO) {
  const files = SHIPPED
    .filter(([dir]) => existsSync(path.join(root, dir)))
    .flatMap(([dir, pattern]) => walk(path.join(root, dir), dir).filter((file) => pattern.test(path.basename(file))))
    .filter((file) => !GENERATED.includes(file))
    .sort();

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(path.join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(contentHash());
