// 화면 언어. 영어 문구를 그대로 키로 쓰고, 한국어 사전에 있으면 바꾼다(없으면 영어 그대로).
// {n}, {name} 같은 자리는 vars로 채운다.
import { KO } from "./i18n.ko.ts";

export type Lang = "ko" | "en";
export const LANGS: { value: Lang; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];

export type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const s = lang === "ko" ? (KO[key] ?? key) : key;
  return vars ? s.replace(/\{(\w+)\}/g, (_: string, k: string) => String(vars[k] ?? `{${k}}`)) : s;
}

// 나중에 t()로 바꿀 문구를 표나 상수에 둘 때 감싼다. 그대로 돌려주고, 빠진 번역 점검(scripts/i18n-check.ts)이 이걸 보고 찾는다.
export const msg = (key: string) => key;

export const translator = (lang: Lang): T => (key, vars) => translate(lang, key, vars);
export const plain: T = (key, vars) => translate("en", key, vars);

export function localeOf(lang: Lang): string {
  return lang === "ko" ? "ko-KR" : "en-US";
}
