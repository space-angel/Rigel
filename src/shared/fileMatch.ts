// Files 도구(로컬 파일)의 순수 로직: Spotlight 질의 만들기, 후보 고르기, 근거 줄 뽑기.
// 파일 내용은 맥 안에서만 쓴다. Claude에게는 파일 이름만 보낸다.

const clean = (w: string) => w.replace(/["\\*]/g, "").trim();

// 이름이나 내용에 낱말이 들어 있고, 최근 30일에 열었거나 고친 파일
export function spotlightQuery(words: string[], days = 30): string | null {
  const ws = words.map(clean).filter((w) => w.length > 1).slice(0, 4);
  if (!ws.length) return null;
  const match = ws.flatMap((w) => [`kMDItemDisplayName == "*${w}*"cd`, `kMDItemTextContent == "*${w}*"cd`]).join(" || ");
  return `(${match}) && (kMDItemLastUsedDate >= $time.today(-${days}) || kMDItemContentModificationDate >= $time.today(-${days}))`;
}

// 사람이 쓴 문서만 본다. 앱·설정 폴더, 코드 파일은 뺀다.
const DOC_EXT = /\.(md|markdown|txt|rtf|rtfd|docx?|odt|pages|pdf|key|pptx?|numbers|xlsx?|csv|hwpx?|html?)$/i;
export function isDocumentPath(p: string): boolean {
  return Boolean(p) && DOC_EXT.test(p) && !/\/(Library|node_modules|\.[^/]+|Applications)\//.test(p);
}

// 한국어 낱말은 Spotlight가 쪼개서 색인해 형식 질의(kMDItemTextContent)로는 안 잡히는 경우가 있다.
// 그래서 일반 검색(mdfind <낱말>)도 함께 쓴다. 일반 검색에는 날짜 조건이 없어서 앱이 고친 날로 거른다.
export const NATURAL_MAX_WORDS = 3;

export interface FileCandidate {
  path: string;
  name: string;
  modified: number;
  content: string | null; // 읽을 수 있는 글 파일이면 내용(앞부분)
}

// macOS 파일 경로의 한글은 자모가 풀린 꼴(NFD)로 올 때가 있어 합쳐서(NFC) 비교한다.
const norm = (s: string) => s.normalize("NFC").toLowerCase();
const count = (hay: string, words: string[]) => words.filter((w) => norm(hay).includes(norm(w))).length;

// 고르는 기준: 이름에 맞은 낱말(무겁게) + 내용에 맞은 낱말, 같으면 최근에 고친 것.
export function rankFiles(cands: FileCandidate[], words: string[]): (FileCandidate & { inName: number; inContent: number })[] {
  return cands
    .map((c) => ({ ...c, inName: count(c.name, words), inContent: c.content ? count(c.content, words) : 0 }))
    .filter((c) => c.inName + c.inContent > 0 || c.content === null)
    .sort((a, b) => b.inName * 2 + b.inContent - (a.inName * 2 + a.inContent) || b.modified - a.modified);
}

// 근거로 보여 줄 줄: 낱말이 가장 많이 들어간 줄과 그 뒤 내용 줄 두 개, 160자 이내.
// (제목 줄만 맞으면 제목만 보여서 근거가 안 되므로 뒤 내용까지)
export function evidenceLines(content: string, words: string[]): string | null {
  const lines = content.normalize("NFC").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let best = -1;
  let bestScore = 0;
  lines.forEach((l, i) => {
    const s = count(l, words);
    if (s > bestScore) [best, bestScore] = [i, s];
  });
  if (best < 0) return null;
  const strip = (l: string) => l.replace(/^[#>*\-\s]+/, "");
  const pick = lines.slice(best, best + 3).map(strip).filter(Boolean).join(" · ");
  return pick.length > 160 ? `${pick.slice(0, 157)}…` : pick;
}

// 처음 몇 줄 (내용에 낱말이 없고 이름으로만 맞았을 때 미리보기)
export function firstLines(content: string, n = 3): string {
  const text = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, n).join(" ");
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}
