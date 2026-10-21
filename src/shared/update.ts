// 앱 업데이트. 설치 파일은 공개 레포 space-angel/todoban-releases의 GitHub Releases에 올린다.
// 윈도우는 뒤에서 받아 두었다가 다시 켤 때 설치(electron-updater), 맥은 서명 전이라 자동 설치가 안 돼서 새 버전을 알리고 받게 한다.
export const RELEASES_REPO = "space-angel/todoban-releases";
export const DOWNLOAD_PAGE = "https://space-angel.github.io/todoban-releases/";

export type UpdateState =
  | { status: "idle" | "checking" | "latest"; current: string }
  | { status: "available"; current: string; version: string; url: string } // 맥: 받기 버튼
  | { status: "downloading"; current: string; version: string; percent: number } // 윈도우
  | { status: "ready"; current: string; version: string } // 윈도우: 다시 켜면 바뀐다
  | { status: "error"; current: string; message: string };

// 1.2.10 > 1.2.9, v0.2.0 = 0.2.0. 숫자가 아닌 꼬리(-beta)는 그보다 앞으로 본다.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, "").split("-", 2);
    return { nums: core!.split(".").map((n) => Number(n) || 0), pre: pre ?? null };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

// 맥에서 받을 설치 파일. 이름에 버전이 없어서 늘 최신 릴리스를 가리킨다(electron-builder.yml artifactName).
export function macDownloadUrl(arch: string, repo = RELEASES_REPO): string {
  return `https://github.com/${repo}/releases/latest/download/Rigel-mac-${arch === "arm64" ? "arm64" : "x64"}.dmg`;
}
