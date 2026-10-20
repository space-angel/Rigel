# 시나리오용 데이터를 오늘 기준으로 만든다.
# 실행: python3 docs/qa/fixtures/seed.py <폴더> [list|many]
#   list: 오늘 5개(포폴·우테크·사일로·면접 준비·이력서) + 끝냄 1 + 내일 1 + 나중 3, 피그마 바로가기 3개
#   many: 오늘 할 일 16개 (키보드 스크롤 확인용)
import datetime, json, os, sys

out, kind = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "list")
os.makedirs(out, exist_ok=True)
today = datetime.date.today()
iso = lambda d: d.isoformat()
day = lambda n: iso(today + datetime.timedelta(days=n))

def t(i, title, planned, clear=True, sc=None, done=False, due=None):
    return {"id": f"t{i}", "title": title, "plannedDate": planned, "dueDate": due, "order": i,
            "completedAt": f"{iso(today)}T01:00:00.000Z" if done else None, "createdAt": f"{day(-1)}T05:00:00.000Z",
            "rawText": title, "isClear": clear, "shortcutId": sc, "context": []}

if kind == "many":
    todos = [t(i, f"할 일 {i + 1:02d} 키보드 스크롤 확인", iso(today)) for i in range(16)]
else:
    todos = [
        t(1, "포폴 올리브영 장표 지표 문장 고치기", iso(today), sc="s1"),
        t(2, "우테크 과제 README 마무리하기", iso(today)),
        t(3, "사일로 발표 자료 3~5번 장표 검토하기", iso(today), sc="s2"),
        t(4, "면접 준비", iso(today), clear=False),
        t(5, "이력서 PDF 다시 내보내기", iso(today)),
        t(6, "리크루터 메일 답장하기", iso(today), done=True),
        t(7, "포트폴리오 사이트 도메인 알아보기", None),
        t(30, "사일로 리허설 피드백 정리하기", day(1), sc="s2"),
        t(31, "영어 스터디 자료 정리하기", day(3)),
        t(32, "운동 루틴", None, clear=False),
    ]
data = {
    "version": 2,
    "todos": todos,
    "shortcuts": [
        {"id": "s1", "name": "포폴", "keywords": ["포폴", "포트폴리오", "덱"], "url": "https://www.figma.com/design/uLkrdQtbosV1DMYSYHsYeB/todoBAN?node-id=12-408", "appBundleId": "com.figma.Desktop"},
        {"id": "s2", "name": "사일로", "keywords": ["사일로", "발표"], "url": "https://www.figma.com/design/abc/Silo-Demo-Day?node-id=3-77", "appBundleId": "com.figma.Desktop"},
        {"id": "s3", "name": "우테크", "keywords": ["우테크", "과제"], "url": "https://www.figma.com/design/wootech/Assignment", "appBundleId": "com.figma.Desktop"},
    ],
    "settings": {"hotkey": "Alt+Space", "claudePath": None, "model": "sonnet", "themeId": "default", "openAtLogin": False,
                 "lastCarryOverCheck": iso(today), "welcomed": True},
}
json.dump(data, open(os.path.join(out, "data.json"), "w"), ensure_ascii=False, indent=2)
print(f"{out}/data.json · {kind} · {len(todos)}개")
