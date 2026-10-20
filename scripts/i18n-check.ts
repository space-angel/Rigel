// 번역 점검: 코드에서 t()·tr()·translate()·msg()로 쓰는 영어 문구를 모아 한국어 사전(i18n.ko.ts)과 맞춰 본다.
// 빠진 번역이 있으면 1로 끝난다. 사전에만 있고 안 쓰는 문구도 보여 준다.
// 실행: node scripts/i18n-check.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { KO } from "../src/shared/i18n.ko.ts";

// 어느 언어에서나 그대로 쓰는 이름
const SAME = new Set(["Figma", "Notion", "Linear", "Claude", "todoBAN", "Sonnet", "Haiku"]);

const root = new URL("../src/", import.meta.url).pathname;
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name) && !/\.test\.ts$|i18n\.ko\.ts$/.test(name)) files.push(p);
  }
};
walk(root);

const used = new Map<string, string>();

for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\b(?:t|tr|msg)\(\s*"((?:[^"\\]|\\.)*)"|\btranslate\(\s*\w+,\s*"((?:[^"\\]|\\.)*)"/g)) {
    const key = JSON.parse(`"${m[1] ?? m[2]}"`) as string;
    if (!used.has(key)) used.set(key, f.slice(root.length));
  }
}


const missing = [...used].filter(([k]) => !(k in KO) && !SAME.has(k));
const unused = Object.keys(KO).filter((k) => !used.has(k));
console.log(`문구 ${used.size}개 · 한국어 ${Object.keys(KO).length}개`);
if (unused.length) console.log(`\n사전에만 있음 (${unused.length})\n${unused.map((k) => `  ${k}`).join("\n")}`);
if (missing.length) {
  console.log(`\n번역 없음 (${missing.length})\n${missing.map(([k, f]) => `  ${k}  ← ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("빠진 번역 없음");
