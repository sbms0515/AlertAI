# 바이오 AI 뉴스레터 생성기 (Gemini + Google Search Grounding)

Gemini와 Google Search Grounding을 이용해 바이오 분야 최신 소식을 자동으로 모아
뉴스레터 형태로 보여주는 Next.js 앱입니다.

## 기능

- 뉴스 3건: 게시 시각 기준 최근 **36시간 이내**
- 논문 1건: 게시 시각 기준 최근 **2주 이내**
- 생성 결과를 서버에서 재검증해 조건 미충족 시 `partial` 상태 + 경고 반환
- Grounding 출처 링크 목록 제공

## 1) 환경 변수 설정

`frontend/.env.local` 파일을 만들고 아래 값을 설정합니다.

```bash
GEMINI_API_KEY=your_api_key_here
# 선택값 (기본값: gemini-2.5-flash)
GEMINI_MODEL=gemini-2.5-flash
```

> `GEMINI_API_KEY`가 없으면 API 호출이 실패합니다.

## 2) 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 후, 키워드(예: 바이오, 유전자치료)를 입력하고
`뉴스레터 생성` 버튼을 누르면 됩니다.

## 3) API 엔드포인트

- `POST /api/newsletter`

요청 예시:

```json
{
  "topic": "바이오"
}
```

응답 주요 필드:

- `status`: `ok` | `partial`
- `news`: 최근 36시간 이내 뉴스 배열(최대 3)
- `paper`: 최근 2주 이내 논문 1건(없으면 `null`)
- `groundingSources`: 검색 그라운딩 출처 목록
- `warnings`: 조건 미충족 시 경고 메시지
