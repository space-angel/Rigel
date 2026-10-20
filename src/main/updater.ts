import { app, net } from "electron";
import { autoUpdater } from "electron-updater";
import { RELEASES_REPO, compareVersions, macDownloadUrl, type UpdateState } from "@shared/update";

const FIRST_CHECK_MS = 15_000;
const EVERY_MS = 6 * 3600_000;

// 새 버전 확인. 배포한 앱에서만 돈다(개발·점검 실행은 TODOBAN_UPDATE_FEED로 가짜 최신 버전을 줄 때만).
// 실패(인터넷 없음 등)는 조용히 넘기고 다음 확인 때 다시 본다. 사용자를 재촉하지 않는다.
export class Updater {
  state: UpdateState = { status: "idle", current: app.getVersion() };
  private timer: ReturnType<typeof setInterval> | null = null;
  private feed = process.env.TODOBAN_UPDATE_FEED ?? null;
  private winAuto = process.platform === "win32" && app.isPackaged && !this.feed;

  constructor(private onChange: (s: UpdateState) => void) {
    if (this.winAuto) {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = null;
      autoUpdater.on("download-progress", (p) => {
        const version = "version" in this.state ? this.state.version : "";
        this.set({ status: "downloading", current: this.state.current, version, percent: Math.round(p.percent) });
      });
      autoUpdater.on("update-downloaded", (info) => this.set({ status: "ready", current: this.state.current, version: info.version }));
      autoUpdater.on("error", (e) => this.set({ status: "error", current: this.state.current, message: String(e?.message ?? e) }));
    }
  }

  start(): void {
    if (!app.isPackaged && !this.feed) return;
    setTimeout(() => void this.check(), this.feed ? 500 : FIRST_CHECK_MS);
    this.timer = setInterval(() => void this.check(), EVERY_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private set(s: UpdateState): void {
    this.state = s;
    this.onChange(s);
  }

  // 공개 레포의 최신 릴리스 번호. 점검용 피드는 같은 모양의 JSON 파일 주소(file:// 또는 http)다.
  private async latest(): Promise<string> {
    const url = this.feed ?? `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
    const res = await net.fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "todoBAN" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { tag_name?: string };
    if (!body.tag_name) throw new Error("tag_name 없음");
    return body.tag_name.replace(/^v/, "");
  }

  async check(): Promise<void> {
    if (this.state.status === "downloading" || this.state.status === "ready") return;
    const current = app.getVersion();
    this.set({ status: "checking", current });
    try {
      const version = await this.latest();
      if (compareVersions(version, current) <= 0) return this.set({ status: "latest", current });
      // 윈도우: 받아 두었다가 다시 켤 때 설치. 맥: 서명 전이라 자동 설치가 안 되니 받을 주소를 알린다.
      if (this.winAuto) {
        this.set({ status: "downloading", current, version, percent: 0 });
        await autoUpdater.checkForUpdates();
      } else this.set({ status: "available", current, version, url: macDownloadUrl(process.arch) });
    } catch (e) {
      this.set({ status: "error", current, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // 윈도우: 지금 다시 켜서 새 버전으로
  install(): void {
    if (this.state.status === "ready") autoUpdater.quitAndInstall();
  }
}
