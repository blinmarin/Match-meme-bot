import { config } from "../config.ts";
import { sleep } from "../utils.ts";

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
