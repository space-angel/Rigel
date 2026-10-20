// 아이콘을 PNG로 그린다(외부 패키지 없이).
// - 맥 메뉴바: 템플릿 아이콘(둥근 사각형 테두리 + 체크, 알파만) → resources/trayTemplate.png, @2x
// - 윈도우 트레이: 파란 둥근 사각형 + 흰 체크(밝은·어두운 작업 표시줄 모두에서 보이게) → resources/tray-win.png, tray-win@2x.png
// - 앱 아이콘(배포용, 1024px) → build/icon.png
// 실행: node scripts/make-tray-icon.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

type RGBA = [number, number, number, number];
function png(size: number, alpha: (x: number, y: number) => number): Buffer {
  return pngRGBA(size, (x, y) => [0, 0, 0, alpha(x, y)]);
}
function pngRGBA(size: number, color: (x: number, y: number) => RGBA): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const [r, g, b, a] = color(x, y);
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 16×16 기준 좌표의 도형. 픽셀마다 4×4 샘플로 안티앨리어싱한다.
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function roundRectDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number, r: number): number {
  const cx = Math.max(x0 + r, Math.min(px, x1 - r));
  const cy = Math.max(y0 + r, Math.min(py, y1 - r));
  return Math.hypot(px - cx, py - cy) - r;
}
function inside(px: number, py: number): boolean {
  const ring = Math.abs(roundRectDist(px, py, 1.75, 1.75, 14.25, 14.25, 4)) <= 0.75;
  const check = Math.min(segDist(px, py, 4.9, 8.2, 7.1, 10.4), segDist(px, py, 7.1, 10.4, 11.2, 5.9)) <= 0.85;
  return ring || check;
}

function render(size: number): Buffer {
  const s = size / 16;
  const N = 4;
  return png(size, (x, y) => {
    let hit = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (inside((x + (i + 0.5) / N) / s, (y + (j + 0.5) / N) / s)) hit++;
    return hit / (N * N);
  });
}

// 색 아이콘: 둥근 사각형을 파랑(위→아래 그라데이션)으로 채우고 체크는 흰색. pad는 가장자리 여백(16 기준).
function renderColor(size: number, pad: number, radius: number, stroke: number): Buffer {
  const s = size / 16;
  const N = 4;
  const top: RGBA = [94, 152, 254, 1];
  const bottom: RGBA = [47, 107, 255, 1];
  return pngRGBA(size, (x, y) => {
    let fill = 0;
    let mark = 0;
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const px = (x + (i + 0.5) / N) / s;
        const py = (y + (j + 0.5) / N) / s;
        if (roundRectDist(px, py, pad, pad, 16 - pad, 16 - pad, radius) <= 0) fill++;
        if (Math.min(segDist(px, py, 4.9, 8.2, 7.1, 10.4), segDist(px, py, 7.1, 10.4, 11.2, 5.9)) <= stroke) mark++;
      }
    const a = fill / (N * N);
    const m = Math.min(mark / (N * N), a);
    const t = y / size;
    const bg = top.map((c, k) => c + (bottom[k]! - c) * t);
    // 흰 체크를 파랑 위에 덮는다
    return [Math.round(bg[0]! + (255 - bg[0]!) * (m / (a || 1))), Math.round(bg[1]! + (255 - bg[1]!) * (m / (a || 1))), Math.round(bg[2]! + (255 - bg[2]!) * (m / (a || 1))), a];
  });
}

mkdirSync(new URL("../resources/", import.meta.url), { recursive: true });
mkdirSync(new URL("../build/", import.meta.url), { recursive: true });
writeFileSync(new URL("../resources/trayTemplate.png", import.meta.url), render(16));
writeFileSync(new URL("../resources/trayTemplate@2x.png", import.meta.url), render(32));
writeFileSync(new URL("../resources/tray-win.png", import.meta.url), renderColor(16, 1, 3.5, 1.1));
writeFileSync(new URL("../resources/tray-win@2x.png", import.meta.url), renderColor(32, 1, 3.5, 1.1));
// 앱 아이콘: macOS 아이콘 격자처럼 가장자리를 10%쯤 비운다
writeFileSync(new URL("../build/icon.png", import.meta.url), renderColor(1024, 1.6, 3.6, 0.95));
console.log("resources/trayTemplate(@2x).png, tray-win(@2x).png, build/icon.png");
