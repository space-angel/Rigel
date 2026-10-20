import { localeOf, translate, type Lang, type Vars } from "@shared/i18n";

// 창마다 지금 언어를 하나 들고 있다. 창의 맨 위 화면이 데이터를 받을 때 setLang으로 맞추고, 아래 화면들은 t()만 쓴다.
let lang: Lang = "ko";
export function setLang(next: Lang | undefined): void {
  lang = next ?? "ko";
  if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
}
export const t = (key: string, vars?: Vars) => translate(lang, key, vars);
export const loc = () => localeOf(lang);
export const currentLang = () => lang;
