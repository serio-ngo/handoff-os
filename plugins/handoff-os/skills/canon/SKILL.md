---
name: canon
description: "Answer any question about the owner's organisation — name, mission, registry identifiers, address, contact, bank, people — from the live sources listed in config/org.json, never from memory, training or a file in this repository. A source is any document the owner points at: a public page, a shared doc, a wiki, a pinned message. Zero sources configured is a valid state: then every fact comes from asking the owner. Use whenever anyone asks what the organisation is, what it stands for, or for one of its identifiers. If no source carries the fact, say NOT IN CANON and name who must publish it."
license: Apache-2.0
compatibility: No required connector. Reads whatever the owner listed; asks the owner when the list is empty or silent.
---

## 1. Where a fact may come from

`config/org.json` holds pointers and nothing else. Every key is optional.

```json
{ "name": "Acme", "addressAs": "Sam", "language": "en",
  "sources": ["https://acme.example/about", "Company doc store / Facts"] }
```

| Order | Look here | How |
|---|---|---|
| 1 | a literal value already in `org.json` — typically `name`, `addressAs`, `language` | use it as written |
| 2 | every entry in `sources`, in order | read it **live**, this turn: `WebFetch` for a URL, the doc store for a document, the tracker for an item |
| 3 | the owner, in conversation | ask one direct question |

Anything money-shaped or naming a person — bank details, beneficiaries, contracts, home addresses — goes
straight to step 3 even when a source might carry it. Never write those into `org.json` or any tracked file.

`sources` may be empty, hold one link, or hold ten. A name and nothing else is a complete configuration.

## 2. Answer shape

1. Read the source live. Every time. No caching across turns.
2. Quote the value **and** where it came from — the URL, the document name, or "you told me this turn".
3. Not there, go to section 3. Never fill the gap from anywhere else.

## 3. NOT IN CANON — hard, no exceptions

| If | Say exactly |
|---|---|
| No configured source carries it | `NOT IN CANON. Add it to a source, or tell me and I will use it for this turn only.` |
| It is money, or names a person | `NOT IN CANON. I never read this. Give me the value directly.` |
| Two sources disagree | `NOT IN CANON. Conflict: A says X, B says Y. You decide, then fix the source.` |
| A source is unreachable | `NOT IN CANON. That source is unreachable. Retry, never answer from memory.` |
| `sources` is empty | `No sources configured. Tell me the value, or add a link: npm run setup -- --sources <url>` |

A wrong registry identifier is a filing error, not a small inconvenience. Silence beats a guess.
