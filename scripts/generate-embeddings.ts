import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";

const INPUT_PATH = "data/memes-indexed.json";
const HF_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}/pipeline/feature-extraction`;
const EMBEDDING_DIMENSIONS = 384;
const DELAY_MS = 200;
const SAVE_EVERY = 10;
const MAX_RETRIES = 5;
const COLD_START_DELAY_MS = 20_000;

interface Meme {
  id: string;
  name: string;
  url: string;
  description: string;
}

interface EnrichedMeme extends Meme {
  embedding: number[];
}

interface EnrichedMemesFile {
  lastUpdated: string;
  model?: string;
  dimensions?: number;
  count: number;
  memes: Array<Meme & { embedding?: number[] }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnrichedMemes(): EnrichedMemesFile {
  const raw = readFileSync(INPUT_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveEnrichedMemes(data: EnrichedMemesFile): void {
  data.lastUpdated = new Date().toISOString();
  data.model = HF_MODEL;
  data.dimensions = EMBEDDING_DIMENSIONS;
  writeFileSync(INPUT_PATH, JSON.stringify(data, null, 2), "utf-8");
}

async function embedText(text: string, apiToken: string): Promise<number[]> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    });

    if (response.ok) {
      const data: number[] = await response.json();
      if (!Array.isArray(data) || data.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Неожиданный формат ответа: длина ${Array.isArray(data) ? data.length : "не массив"}`,
        );
      }
      return data;
    }

    if (response.status === 503) {
      console.warn(
        `  Модель загружается (попытка ${attempt + 1}/${MAX_RETRIES}), ожидание ${COLD_START_DELAY_MS / 1000} сек...`,
      );
      await sleep(COLD_START_DELAY_MS);
      continue;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after")) || 10;
      console.warn(
        `  Rate limit (попытка ${attempt + 1}/${MAX_RETRIES}), ожидание ${retryAfter} сек...`,
      );
      await sleep(retryAfter * 1000);
      continue;
    }

    const body = await response.text();
    throw new Error(`HF API ошибка ${response.status}: ${body}`);
  }

  throw new Error(`Не удалось получить эмбеддинг после ${MAX_RETRIES} попыток`);
}

async function main() {
  const apiToken = process.env.HF_API_TOKEN;
  if (!apiToken) {
    console.error("Ошибка: переменная окружения HF_API_TOKEN не задана");
    process.exit(1);
  }

  const data = loadEnrichedMemes();
  const total = data.memes.length;

  // Проверяем что все мемы обогащены
  const withoutDescription = data.memes.filter((m) => !m.description);
  if (withoutDescription.length > 0) {
    console.error(
      `${withoutDescription.length} мемов без описания. Сначала запусти: npm run enrich`,
    );
    process.exit(1);
  }

  const alreadyEmbedded = data.memes.filter(
    (m) => m.embedding?.length === EMBEDDING_DIMENSIONS,
  ).length;
  console.log(
    `Загружено ${total} мемов, уже с эмбеддингами: ${alreadyEmbedded}`,
  );

  let generatedCount = 0;

  for (let i = 0; i < data.memes.length; i++) {
    const meme = data.memes[i];
    const index = i + 1;

    // Пропускаем если эмбеддинг уже есть
    if (meme.embedding?.length === EMBEDDING_DIMENSIONS) {
      continue;
    }

    try {
      const embedding = await embedText(meme.description, apiToken);
      meme.embedding = embedding;
      generatedCount++;
      console.log(`[${index}/${total}] Embedded: "${meme.name}"`);
    } catch (error) {
      console.error(`[${index}/${total}] Ошибка для "${meme.name}":`, error);
      saveEnrichedMemes(data);
      console.log(`Прогресс сохранён (${total} мемов)`);
      process.exit(1);
    }

    if (generatedCount > 0 && generatedCount % SAVE_EVERY === 0) {
      saveEnrichedMemes(data);
      console.log(`Прогресс сохранён`);
    }

    await sleep(DELAY_MS);
  }

  saveEnrichedMemes(data);
  console.log(
    `Готово! Сгенерировано ${generatedCount} эмбеддингов, всего ${total} мемов`,
  );
}

main().catch((error) => {
  console.error("Ошибка генерации эмбеддингов:", error);
  process.exit(1);
});
