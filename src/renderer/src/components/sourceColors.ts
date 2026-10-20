// 도구마다 알아보기 쉬운 색. 첫 행동을 만드는 동안 실제로 쓰는 도구의 색이 빛에 섞인다.
const COLOR: Record<string, string> = {
  notion: "rgb(236 236 232)",
  linear: "rgb(124 134 255)",
  figma: "rgb(255 114 98)",
  frame: "rgb(162 89 255)",
  calendar: "rgb(255 92 92)",
  files: "rgb(96 176 255)",
  todoban: "rgb(94 152 254)",
};
const DEFAULT = "rgb(94 152 254)";

// 쓰는 도구 색을 최대 셋까지(없으면 앱 파랑 하나)
export function sourceColors(sources: string[]): string[] {
  const colors = [...new Set(sources.map((s) => COLOR[s]).filter((c): c is string => Boolean(c)))].slice(0, 3);
  return colors.length ? colors : [DEFAULT];
}
