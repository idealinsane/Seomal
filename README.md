# Seomal

강의·학습 경로를 시각화하는 그래프 뷰어입니다.

## 실행 방법

### 요구사항

- Node.js (npx 사용)

### 실행

```bash
npx serve -p 3000
```

브라우저에서 `http://localhost:3000` 접속

### URL 옵션

- `?src=accounting` — `data/accounting.json` 로드 (기본: `data/data.json`)
- `?i=<노드ID>` — 특정 노드에 포커스

---

## 그래프 데이터 구성 (data.json)

`data/*.json` 파일은 Cytoscape 형식의 JSON 배열입니다. 노드와 엣지를 정의해 학습 경로 그래프를 구성합니다.

### 파일 로드 규칙

- `?src` 없음 → `data/data.json`
- `?src=accounting` → `data/accounting.json`

### 노드 (Node)

```json
{
  "data": {
    "id": "고유ID",
    "label": "화면에 표시될 이름",
    "url": "https://example.com/링크"
  }
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✓ | 노드 고유 식별자 (엣지에서 참조) |
| `label` | ✓ | 그래프에 표시되는 텍스트 |
| `url` | | 클릭 시 이동할 링크 (없으면 클릭 시 하이라이트만) |

### 엣지 (Edge)

```json
{
  "data": {
    "id": "엣지ID",
    "source": "시작노드ID",
    "target": "끝노드ID"
  }
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✓ | 엣지 고유 식별자 |
| `source` | ✓ | 후행(다음) 노드 ID — 이 과목을 배우려면 target이 선수 |
| `target` | ✓ | 선행(선수) 노드 ID — 먼저 배워야 하는 과목 |

엣지는 `source → target` 방향으로, "source를 배우려면 target을 먼저 이수해야 함"을 나타냅니다.

### 예시

```json
[
  { "data": { "id": "A", "label": "기초", "url": "https://example.com/a" } },
  { "data": { "id": "B", "label": "심화", "url": "https://example.com/b" } },
  { "data": { "id": "B-A", "source": "B", "target": "A" } }
]
```

위 예시는 "심화(B)"를 배우려면 "기초(A)"를 먼저 이수해야 함을 나타냅니다 (`source=B, target=A`). 새 JSON 파일을 `data/` 폴더에 추가한 뒤 `?src=파일명`으로 로드할 수 있습니다.
