import { config } from "../config.ts";
import { sleep } from "../utils.ts";
import type { EnrichedMeme } from "../types.ts";

const MAX_RETRIES = 3;

export async function embedText(text: string): Promise<number[]> {
  const url = `${config.hf.apiUrl}/${config.hf.model}/pipeline/feature-extraction`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.hf.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    });

    if (response.ok) {
      const data: number[] = await response.json();
      if (
        !Array.isArray(data) ||
        data.length !== config.hf.embeddingDimensions
      ) {
        throw new Error(
          `Неожиданный формат ответа: длина ${Array.isArray(data) ? data.length : "не массив"}`,
        );
      }
      return data;
    }

    if (response.status === 503) {
      console.warn(
        `HF модель загружается (попытка ${attempt + 1}/${MAX_RETRIES})...`,
      );
      await sleep(config.hf.coldStartDelayMs);
      continue;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after")) || 10;
      console.warn(`HF rate limit, ожидание ${retryAfter} сек...`);
      await sleep(retryAfter * 1000);
      continue;
    }

    const body = await response.text();
    throw new Error(`HF API ошибка ${response.status}: ${body}`);
  }

  throw new Error(`HF API недоступен после ${MAX_RETRIES} попыток`);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

export function findTopCandidates(
  queryEmbedding: number[],
  memes: EnrichedMeme[],
  n: number,
): EnrichedMeme[] {
  return memes
    .map((meme) => ({
      meme,
      score: cosineSimilarity(queryEmbedding, meme.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((item) => item.meme);
}
