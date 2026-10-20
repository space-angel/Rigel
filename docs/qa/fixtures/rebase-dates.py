# 시나리오 데이터의 날짜를 오늘 기준으로 옮긴다. 데이터를 만든 날(--from)과 오늘의 차이만큼 할 날짜·마감·끝낸 시각을 민다.
# 날짜가 바뀌면 어제 데이터가 "지난 할 일"이 되어 시나리오가 깨지므로, 돌리기 전에 쓴다.
# 실행: python3 docs/qa/fixtures/rebase-dates.py <data.json> [--from 2026-10-20]
import datetime, json, sys

path = sys.argv[1]
base = datetime.date.fromisoformat(sys.argv[sys.argv.index("--from") + 1] if "--from" in sys.argv else "2026-10-20")
shift = datetime.date.today() - base
d = json.load(open(path))

def move(v):
    return (datetime.date.fromisoformat(v) + shift).isoformat() if v else v

for t in d["todos"]:
    t["plannedDate"] = move(t.get("plannedDate"))
    t["dueDate"] = move(t.get("dueDate"))
    if t.get("completedAt"):
        t["completedAt"] = (datetime.datetime.fromisoformat(t["completedAt"].replace("Z", "+00:00")) + shift).isoformat().replace("+00:00", "Z")
d["settings"]["lastCarryOverCheck"] = datetime.date.today().isoformat()
json.dump(d, open(path, "w"), ensure_ascii=False, indent=2)
print(f"{path}: {shift.days}일 옮김")
