"use client";

import { FormEvent, useMemo, useState } from "react";

type NewsletterItem = {
  title: string;
  summary: string;
  whyItMatters: string;
  source: string;
  url: string;
  publishedAtUtc: string;
};

type NewsletterResponse = {
  topic: string;
  model: string;
  generatedAtUtc: string;
  status: "ok" | "partial";
  warnings: string[];
  editorNote: string;
  news: NewsletterItem[];
  paper: NewsletterItem | null;
  groundingSources: Array<{ title: string; url: string }>;
  error?: string;
  details?: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

export default function Home() {
  const [topic, setTopic] = useState("바이오");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NewsletterResponse | null>(null);

  const canGenerate = useMemo(() => topic.trim().length > 0, [topic]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canGenerate || isLoading) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: topic.trim() }),
      });

      const data = (await response.json()) as NewsletterResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "뉴스레터 생성 중 오류가 발생했습니다.");
      }

      setResult(data);
    } catch (submissionError) {
      setResult(null);
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10 md:px-10">
      <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/15 dark:bg-zinc-950">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          바이오 AI 뉴스레터 생성기
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Gemini + Google Search Grounding으로 최근 36시간 뉴스 3건과 최근
          2주 논문 1건을 자동으로 수집/요약합니다.
        </p>

        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3 md:flex-row">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 바이오, 유전자치료, 디지털헬스"
            className="w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-blue-500 dark:border-white/20 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={!canGenerate || isLoading}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isLoading ? "생성 중..." : "뉴스레터 생성"}
          </button>
        </form>

        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
          <li>뉴스 필터: 게시 시각 기준 최근 36시간</li>
          <li>논문 필터: 게시 시각 기준 최근 2주</li>
          <li>응답이 기준을 못 채우면 경고 메시지와 함께 partial 상태를 반환</li>
        </ul>
      </section>

      {error && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </section>
      )}

      {result && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/15 dark:bg-zinc-950">
            <h2 className="text-xl font-semibold">생성 결과</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              주제: <span className="font-medium">{result.topic}</span> · 생성시각:
              {" " + formatDate(result.generatedAtUtc)} · 모델: {result.model}
            </p>

            <div className="mt-2 inline-flex rounded-lg px-2 py-1 text-xs font-medium">
              {result.status === "ok" ? (
                <span className="text-emerald-700 dark:text-emerald-300">
                  상태: OK
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-300">
                  상태: PARTIAL
                </span>
              )}
            </div>

            {result.editorNote && (
              <p className="mt-4 rounded-xl bg-zinc-100 p-3 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                {result.editorNote}
              </p>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
              <h3 className="font-semibold">검증 경고</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/15 dark:bg-zinc-950">
            <h3 className="text-lg font-semibold">뉴스 (최근 36시간)</h3>
            <div className="mt-3 grid gap-3">
              {result.news.map((item, index) => (
                <article
                  key={`${item.url}-${index}`}
                  className="rounded-xl border border-black/10 p-4 dark:border-white/15"
                >
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {index + 1}. {item.source} · {formatDate(item.publishedAtUtc)}
                  </p>
                  <h4 className="mt-1 text-base font-semibold">{item.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {item.summary}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    <span className="font-semibold">왜 중요한가:</span>{" "}
                    {item.whyItMatters}
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    원문 보기
                  </a>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/15 dark:bg-zinc-950">
            <h3 className="text-lg font-semibold">논문 (최근 2주)</h3>
            {result.paper ? (
              <article className="mt-3 rounded-xl border border-black/10 p-4 dark:border-white/15">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {result.paper.source} · {formatDate(result.paper.publishedAtUtc)}
                </p>
                <h4 className="mt-1 text-base font-semibold">{result.paper.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {result.paper.summary}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  <span className="font-semibold">왜 중요한가:</span>{" "}
                  {result.paper.whyItMatters}
                </p>
                <a
                  href={result.paper.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  원문 보기
                </a>
              </article>
            ) : (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                조건을 만족하는 논문을 찾지 못했습니다.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/15 dark:bg-zinc-950">
            <h3 className="text-lg font-semibold">Grounding 출처</h3>
            <ul className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              {result.groundingSources.map((source) => (
                <li key={source.url} className="break-words">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {source.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
