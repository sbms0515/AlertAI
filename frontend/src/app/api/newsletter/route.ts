import { NextResponse } from "next/server";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const HOURS_36_MS = 36 * 60 * 60 * 1000;
const DAYS_14_MS = 14 * 24 * 60 * 60 * 1000;

type NewsletterItem = {
  title: string;
  summary: string;
  whyItMatters: string;
  source: string;
  url: string;
  publishedAtUtc: string;
};

type ModelPayload = {
  news?: unknown;
  paper?: unknown;
  editorNote?: unknown;
};

type GroundingSource = {
  title: string;
  url: string;
};

function cleanJsonBlock(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeItem(item: unknown): NewsletterItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const candidate = item as Record<string, unknown>;
  const title = asTrimmedString(candidate.title);
  const summary = asTrimmedString(candidate.summary);
  const whyItMatters = asTrimmedString(candidate.whyItMatters);
  const source = asTrimmedString(candidate.source);
  const url = asTrimmedString(candidate.url);
  const publishedAtUtc = asTrimmedString(candidate.publishedAtUtc);

  if (!title || !summary || !source || !url || !publishedAtUtc) {
    return null;
  }

  return {
    title,
    summary,
    whyItMatters,
    source,
    url,
    publishedAtUtc,
  };
}

function isWithinWindow(
  value: string,
  cutoffMs: number,
  nowMs: number,
): boolean {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return parsed >= cutoffMs && parsed <= nowMs;
}

function extractGroundingSources(raw: unknown): GroundingSource[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const root = raw as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = candidates[0];
  if (!first || typeof first !== "object") {
    return [];
  }

  const groundingMetadata = (first as Record<string, unknown>)
    .groundingMetadata as
    | { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> }
    | undefined;

  const chunks = Array.isArray(groundingMetadata?.groundingChunks)
    ? groundingMetadata.groundingChunks
    : [];

  const unique = new Map<string, GroundingSource>();

  for (const chunk of chunks) {
    const url = asTrimmedString(chunk?.web?.uri);
    const title = asTrimmedString(chunk?.web?.title) || "Referenced source";

    if (!url) {
      continue;
    }

    if (!unique.has(url)) {
      unique.set(url, { title, url });
    }
  }

  return Array.from(unique.values()).slice(0, 12);
}

function parseModelJson(raw: unknown): ModelPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Gemini response is not an object.");
  }

  const root = raw as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = candidates[0];

  if (!first || typeof first !== "object") {
    throw new Error("Gemini response does not include candidates.");
  }

  const content = (first as Record<string, unknown>).content as
    | { parts?: Array<{ text?: string }> }
    | undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned empty text.");
  }

  return JSON.parse(cleanJsonBlock(text)) as ModelPayload;
}

function buildPrompt(topic: string, nowIso: string): string {
  return `
너는 바이오 분야 데일리 뉴스레터 에디터다.
반드시 Google Search Grounding 결과만 사용해서 최신 정보를 정리해라.
현재 기준 시각(UTC): ${nowIso}
주제: ${topic}

아래 JSON 스키마만 정확히 반환해라(키 이름 변경 금지, 다른 텍스트 금지):
{
  "news": [
    {
      "title": "string",
      "summary": "string",
      "whyItMatters": "string",
      "source": "string",
      "url": "string",
      "publishedAtUtc": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "paper": {
    "title": "string",
    "summary": "string",
    "whyItMatters": "string",
    "source": "string",
    "url": "string",
    "publishedAtUtc": "YYYY-MM-DDTHH:mm:ssZ"
  },
  "editorNote": "string"
}

제약 조건:
1) news는 정확히 3개, 모두 최근 36시간 이내 기사.
2) paper는 정확히 1개, 최근 2주 이내 논문(가능하면 peer-reviewed, 없으면 신뢰도 높은 preprint).
3) summary와 whyItMatters는 한국어로 각각 1~2문장.
4) source에는 매체/저널명을 넣고, url은 원문 링크를 넣어라.
5) 중복 이슈는 피하고, 바이오 산업/연구 관점에서 영향이 큰 순서로 정렬해라.
`.trim();
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY가 설정되지 않았습니다. frontend/.env.local 파일을 확인해 주세요.",
      },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    topic?: string;
  };

  const topic =
    typeof body.topic === "string" && body.topic.trim().length > 0
      ? body.topic.trim()
      : "바이오";

  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const newsCutoffMs = nowMs - HOURS_36_MS;
  const paperCutoffMs = nowMs - DAYS_14_MS;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

  const geminiPayload = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(topic, nowIso) }],
      },
    ],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.2,
    },
  };

  const geminiResponse = await fetch(geminiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(geminiPayload),
    cache: "no-store",
  });

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    return NextResponse.json(
      {
        error: "Gemini API 호출에 실패했습니다.",
        details: errorText,
      },
      { status: 502 },
    );
  }

  const rawGeminiJson = (await geminiResponse.json()) as unknown;
  const groundingSources = extractGroundingSources(rawGeminiJson);

  let parsed: ModelPayload;
  try {
    parsed = parseModelJson(rawGeminiJson);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gemini 응답 파싱에 실패했습니다.",
        details: error instanceof Error ? error.message : "Unknown parse error",
        groundingSources,
      },
      { status: 502 },
    );
  }

  const rawNewsList = Array.isArray(parsed.news) ? parsed.news : [];
  const news = rawNewsList
    .map(normalizeItem)
    .filter((item): item is NewsletterItem => item !== null)
    .filter((item) => isWithinWindow(item.publishedAtUtc, newsCutoffMs, nowMs))
    .sort(
      (a, b) =>
        Date.parse(b.publishedAtUtc) - Date.parse(a.publishedAtUtc),
    )
    .slice(0, 3);

  const rawPaper = Array.isArray(parsed.paper) ? parsed.paper[0] : parsed.paper;
  const normalizedPaper = normalizeItem(rawPaper);
  const paper =
    normalizedPaper &&
    isWithinWindow(normalizedPaper.publishedAtUtc, paperCutoffMs, nowMs)
      ? normalizedPaper
      : null;

  const warnings: string[] = [];
  if (news.length < 3) {
    warnings.push(
      `최근 36시간 기준 뉴스가 ${news.length}건만 확인되었습니다. 키워드를 좁히거나 다시 시도해 주세요.`,
    );
  }
  if (!paper) {
    warnings.push(
      "최근 2주 기준 조건을 만족하는 논문 1건을 확정하지 못했습니다. 다시 시도해 주세요.",
    );
  }

  return NextResponse.json({
    topic,
    model: GEMINI_MODEL,
    generatedAtUtc: nowIso,
    status: warnings.length > 0 ? "partial" : "ok",
    warnings,
    editorNote: asTrimmedString(parsed.editorNote),
    news,
    paper,
    groundingSources,
  });
}
