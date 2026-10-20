import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { AppData, emptyData } from "@shared/types";

const dataDir = () => app.getPath("userData");
const dataPath = () => join(dataDir(), "data.json");

export function loadData(): AppData {
  const path = dataPath();
  if (!existsSync(path)) return emptyData();
  try {
    return AppData.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (e) {
    // 읽을 수 없는 파일은 지우지 않고 옆에 남겨 둔 뒤 빈 상태로 시작한다.
    const backup = `${path}.broken-${Date.now()}`;
    copyFileSync(path, backup);
    console.error(`[store] data.json을 읽지 못해 ${backup}로 옮겨 뒀어요`, e);
    return emptyData();
  }
}

// 임시 파일에 쓴 뒤 이름을 바꿔서, 쓰는 도중에 앱이 꺼져도 파일이 깨지지 않게 한다.
export function saveData(data: AppData): void {
  mkdirSync(dataDir(), { recursive: true });
  const tmp = `${dataPath()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, dataPath());
}
