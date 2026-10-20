# 시나리오 데이터에 가짜 claude를 연결하고, '면접 준비'(첫 행동 필요)를 오늘 맨 위로 올린다.
# 실행: python3 docs/qa/fixtures/use-fake-claude.py <데이터 폴더> <가짜 claude 경로>
import json, os, sys

folder, claude = sys.argv[1], sys.argv[2]
p = os.path.join(folder, "data.json")
d = json.load(open(p, encoding="utf-8"))
for t in d["todos"]:
    if t["title"] == "면접 준비":
        t["order"] = -1
d["settings"]["claudePath"] = os.path.abspath(claude)
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False)
print("claudePath =", d["settings"]["claudePath"])
