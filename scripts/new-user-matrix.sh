#!/bin/bash
# 다른 사람 컴퓨터 흉내: 빈 홈 폴더 + 최소 PATH로 앱을 띄워, claude가 놓인 자리·상태마다 화면이 어떻게 보이는지 본다.
# 실행: bash scripts/new-user-matrix.sh <결과 폴더>   (먼저 npm run build)
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=${1:?결과 폴더}
NODE=$(command -v node)
ELECTRON="$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
FAKE="$ROOT/docs/qa/fixtures/fake-claude.mjs"
mkdir -p "$OUT"

wrapper() { # 실제 설치 프로그램처럼 실행 파일 하나(node 경로를 품은 껍데기)
  mkdir -p "$(dirname "$1")"
  printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' "$NODE" "$FAKE" > "$1"; chmod +x "$1"
}

run_case() {
  local name=$1 mode=$2 place=$3
  local home="$OUT/$name/home" data="$OUT/$name/data"
  rm -rf "$OUT/$name"; mkdir -p "$home" "$data"
  case $place in
    none) ;;
    native) wrapper "$home/.local/bin/claude" ;;
    nvm) # npm으로 깐 claude처럼: #!/usr/bin/env node 스크립트 + 같은 폴더의 node
      local bin="$home/.nvm/versions/node/v22.11.0/bin"; mkdir -p "$bin"; ln -s "$NODE" "$bin/node"
      printf '#!/usr/bin/env node\nimport(%s)\n' "\"$FAKE\"" > "$bin/claude"; chmod +x "$bin/claude" ;;
    shell) # 정해 둔 자리에는 없고, .zshrc의 PATH에만 있다
      wrapper "$home/tools/bin/claude"; printf 'export PATH="$HOME/tools/bin:$PATH"\n' > "$home/.zshrc" ;;
  esac
  python3 "$ROOT/docs/qa/fixtures/seed.py" "$data" list > /dev/null
  python3 - "$data" <<'PY'
import json, os, sys
p = os.path.join(sys.argv[1], "data.json"); d = json.load(open(p, encoding="utf-8"))
for t in d["todos"]:
    if t["title"] == "면접 준비": t["order"] = -1
d["settings"]["claudePath"] = None
d["settings"]["welcomed"] = os.environ.get("WELCOMED", "1") == "1"
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False)
PY
  env -i HOME="$home" PATH=/usr/bin:/bin SHELL=/bin/zsh USER="$USER" TMPDIR="$TMPDIR" LANG=ko_KR.UTF-8 \
    FAKE_MODE="$mode" FAKE_DELAY=2 FAKE_LOG="$OUT/$name/calls.log" \
    TODOBAN_LANG=ko TODOBAN_USER_DATA="$data" TODOBAN_E2E="$ROOT/docs/qa/${SCENARIO:-new-user}.e2e.json" TODOBAN_E2E_OUT="$OUT/$name/out" \
    "$ELECTRON" "$ROOT" > "$OUT/$name/app.log" 2>&1
  [ "${SCENARIO:-new-user}" != "new-user" ] && { python3 -c "import json,sys; [print('$name', '|', json.dumps(x.get('value'), ensure_ascii=False)) for x in json.load(open('$OUT/$name/out/results.json')) if x.get('value')]"; return; }
  python3 - "$name" "$OUT/$name/out/results.json" <<'PY'
import json, sys
name, path = sys.argv[1], sys.argv[2]
try: r = json.load(open(path))
except Exception as e: print(f"{name:10} 실행 실패 {e}"); sys.exit()
v = {x["name"]: x.get("value") for x in r}
bad = [x["name"] + " — " + x.get("error", "")[:80] for x in r if not x["ok"]]
s = v.get("설정 · 무엇으로 보이나") or {}
card = (v.get("목록 · 카드 글") or "").replace("다시 하기닫기", "").replace("이 행동으로 바꾸기다시 만들기그대로 두기", "")
print(f"{name:10} | 설정: [{s.get('status')}] {s.get('desc')} | 첫 행동 카드: {card[:70]} | 짧은 할 일: {v.get('짧은 할 일은 claude 없이도 들어간다')}" + (f" | 실패: {bad}" if bad else ""))
PY
}

if [ -n "${ONLY:-}" ]; then for c in $ONLY; do case $c in
  none) run_case none ok none;; native) run_case native ok native;; logout) run_case logout logout native;; limit) run_case limit limit native;; ancient) run_case ancient ancient native;;
esac; done; exit; fi
run_case none ok none
run_case native ok native
run_case nvm ok nvm
run_case logout logout native
run_case expired expired native
run_case limit limit native
run_case offline offline native
run_case apikey apikey native
run_case old old native
run_case ancient ancient native
run_case shell ok shell
