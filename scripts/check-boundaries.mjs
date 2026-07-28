/**
 * Static audit of the React server/client boundary.
 *
 * `tsc --noEmit` type-checks fine across a boundary violation — it's `next
 * build` that fails, and only at build time. This script catches the same class
 * of error in a second, so a broken import doesn't get discovered during a
 * deploy on launch day.
 *
 * Checks:
 *  1. No "use client" file (or anything it imports) pulls in a server-only
 *     module — `pg`, `node:crypto`, `next/headers`, or our db/auth layer.
 *     Bundling those into the browser leaks the database and the session logic.
 *  2. Files using `next/headers` or `pg` are never marked "use client".
 *  3. Every file under app/actions has the "use server" directive.
 *
 * Run: node scripts/check-boundaries.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

const SERVER_ONLY_PACKAGES = ["pg", "next/headers", "node:crypto", "node:fs"];
const SERVER_ONLY_LOCAL = [
  "lib/db", "lib/session", "lib/auth", "lib/orders",
  "lib/admin", "lib/catalog", "lib/email", "lib/dashboard",
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const files = walk(SRC);
const source = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

const isClient = (f) => /^\s*["']use client["']/m.test(source.get(f) ?? "");
const isServerAction = (f) => /^\s*["']use server["']/m.test(source.get(f) ?? "");

function importsOf(file) {
  const text = source.get(file) ?? "";
  const specs = [...text.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
  return specs;
}

/** Resolve a local specifier to a file we know about. */
function resolveLocal(file, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(file), spec);
  else return null;

  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const problems = [];
const rel = (f) => relative(ROOT, f);

for (const file of files) {
  const client = isClient(file);
  const specs = importsOf(file);

  for (const spec of specs) {
    // 2. Server-only packages must never appear in a client component.
    if (client && SERVER_ONLY_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`))) {
      problems.push(`${rel(file)}: "use client" but imports server-only package '${spec}'`);
    }

    // 1. Client components must not import server-only local modules.
    if (client) {
      const normalized = spec.replace(/^@\//, "").replace(/\.tsx?$/, "");
      if (SERVER_ONLY_LOCAL.some((m) => normalized === m || normalized.endsWith(`/${m}`))) {
        problems.push(
          `${rel(file)}: "use client" but imports server-only module '${spec}'. ` +
            `Move the call into a "use server" action instead.`,
        );
      }
    }

    // Transitive: a client component importing a module that itself is server-only.
    if (client) {
      const target = resolveLocal(file, spec);
      if (target) {
        for (const t of importsOf(target)) {
          if (SERVER_ONLY_PACKAGES.some((p) => t === p || t.startsWith(`${p}/`))) {
            if (!isServerAction(target)) {
              problems.push(
                `${rel(file)}: "use client" imports ${rel(target)}, which pulls in '${t}'`,
              );
            }
          }
        }
      }
    }
  }
}

// 3. Anything under app/actions must be a server-action module.
for (const file of files) {
  if (file.includes(join("app", "actions")) && !isServerAction(file)) {
    problems.push(`${rel(file)}: under app/actions but missing the "use server" directive`);
  }
}

// 4. Every export from a "use server" module must be an async function.
//
// Each export becomes a callable RPC endpoint, so Next rejects sync exports
// outright — and it only tells you at compile time, on the request that first
// imports the module. Types and interfaces are erased, so they're exempt.
for (const file of files) {
  if (!isServerAction(file)) continue;
  const text = source.get(file) ?? "";

  for (const m of text.matchAll(/^\s*export\s+(?!type\b|interface\b|default\s+async\b)(\w+)(?:\s+(\w+))?/gm)) {
    const [, first, second] = m;

    // `export async function foo` — fine.
    if (first === "async") continue;
    // `export type` / `export interface` — erased at build, fine.
    if (first === "type" || first === "interface") continue;

    if (first === "function") {
      problems.push(
        `${rel(file)}: "use server" exports a non-async function '${second}'. ` +
          `Server Actions must be async — move pure helpers to src/lib/.`,
      );
    } else if (first === "const" || first === "let" || first === "var") {
      // A const arrow function is only valid if it's async.
      const decl = new RegExp(`export\\s+${first}\\s+${second}\\s*(?::[^=]+)?=\\s*(async)?`).exec(text);
      if (decl && !decl[1]) {
        problems.push(
          `${rel(file)}: "use server" exports non-async '${second}'. ` +
            `Only async functions may be exported from a server-action module.`,
        );
      }
    }
  }
}

const clientCount = files.filter(isClient).length;
console.log(
  `Scanned ${files.length} files (${clientCount} client components, ` +
    `${files.filter(isServerAction).length} server-action modules).`,
);

if (problems.length) {
  console.error(`\n${problems.length} boundary problem(s):\n`);
  for (const p of [...new Set(problems)]) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log("No server/client boundary violations.");
