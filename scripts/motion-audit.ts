// 움직임 점검: styles.css의 transition·@keyframes가 무엇을 움직이는지 본다.
// transform·opacity는 GPU 합성이라 싸다. 나머지는 매 프레임 다시 그리거나(paint) 배치를 다시 하므로(layout) 목록으로 보여 준다.
// 실행: node scripts/motion-audit.ts
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/renderer/src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const COMPOSITE = new Set(["transform", "opacity"]);
const PAINT = new Set(["background-color", "background", "color", "border-color", "fill", "box-shadow", "filter"]);
const ALLOWED_LAYOUT = new Set(["height", "flex-grow"]); // 근거 펼치기, 비율 막대 칸 (작은 영역)

const rows: { where: string; prop: string; kind: string }[] = [];
const kind = (p: string) => (COMPOSITE.has(p) ? "composite" : PAINT.has(p) ? "paint" : ALLOWED_LAYOUT.has(p) ? "layout (allowed)" : "layout");

for (const m of css.matchAll(/([^{}]+)\{([^{}]*transition\s*:[^{}]*)\}/g)) {
  const decl = m[2]!.match(/transition\s*:([^;]+)/)![1]!;
  for (const part of decl.split(",")) {
    const prop = part.trim().split(/\s+/)[0]!;
    if (prop === "none") continue;
    rows.push({ where: m[1]!.trim().split("\n").pop()!.slice(0, 60), prop, kind: kind(prop) });
  }
}
for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
  for (const p of new Set([...m[2]!.matchAll(/([\w-]+)\s*:/g)].map((x) => x[1]!))) rows.push({ where: `@keyframes ${m[1]}`, prop: p, kind: kind(p) });
}
const bad = rows.filter((r) => r.kind === "layout");
const paint = rows.filter((r) => r.kind === "paint");
console.log(`움직이는 속성 ${rows.length}곳 · 합성(transform·opacity) ${rows.filter((r) => r.kind === "composite").length} · 색 칠하기 ${paint.length} · 허용한 배치 ${rows.filter((r) => r.kind === "layout (allowed)").length} · 금지 ${bad.length}`);
for (const r of paint) console.log(`  paint  ${r.prop.padEnd(18)} ${r.where}`);
for (const r of rows.filter((r) => r.kind === "layout (allowed)")) console.log(`  layout ${r.prop.padEnd(18)} ${r.where} (허용)`);
for (const r of bad) console.log(`  ✗      ${r.prop.padEnd(18)} ${r.where}`);
process.exitCode = bad.length ? 1 : 0;
