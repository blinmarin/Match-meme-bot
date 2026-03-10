import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import OpenAI from "openai";
import { config } from "../src/config.ts";
import { sleep } from "../src/utils.ts";
import type { RawMemesFile, IndexedMemesFile } from "../src/types.ts";

const DELAY_MS = 2000; // Пауза между запросами (30 req/min у Groq)
const SAVE_EVERY = 10; // Сохранять прогресс каждые N мемов
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are an internet meme expert. For the given meme name, write a concise one-line description in English.

Include: what is depicted, what emotions it conveys, typical situations where it's used, and relevant keywords.

Format: "{meme_name} — description"

Write nothing else. Only one line.`;

function loadRawMemes(): RawMemesFile {
  const raw = readFileSync(config.data.rawMemesPath, "utf-8");
  return JSON.parse(raw);
}

function loadIndexedMemes(): IndexedMemesFile | null {
  try {
    const raw = readFileSync(config.data.indexedMemesPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveIndexedMemes(data: IndexedMemesFile): void {
  data.lastUpdated = new Date().toISOString();
  data.count = data.memes.length;
  mkdirSync(dirname(config.data.indexedMemesPath), { recursive: true });
  writeFileSync(
    config.data.indexedMemesPath,
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}

async function enrichMeme(
  client: OpenAI,
  memeName: string,
): Promise<string | null> {
  const response = await client.chat.completions.create({
    model: config.groq.model,
    temperature: 0.3,
    max_tokens: 200,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Meme: ${memeName}` },
    ],
  });

  return response.choices[0].message.content?.trim() ?? null;
}

async function main() {
  const client = new OpenAI({
    apiKey: config.groq.apiKey,
    baseURL: config.groq.baseUrl,
  });

  const rawData = loadRawMemes();
  const existing = loadIndexedMemes();
  // Оставляем только мемы с описанием — остальные переобогатим
  const indexed: IndexedMemesFile = existing
    ? { ...existing, memes: existing.memes.filter((m) => m.description) }
    : { lastUpdated: "", count: 0, memes: [] };

  const indexedIds = new Set(indexed.memes.map((m) => m.id));
  const toEnrich = rawData.memes.filter((m) => !indexedIds.has(m.id));

  console.log(
    `Всего мемов: ${rawData.memes.length}, в индексе: ${indexed.memes.length}, нужно обогатить: ${toEnrich.length}`,
  );

  if (toEnrich.length === 0) {
    console.log("Все мемы уже обогащены!");
    return;
  }

  let enrichedCount = 0;
  const total = toEnrich.length;

  for (let i = 0; i < total; i++) {
    const meme = toEnrich[i];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const description = await enrichMeme(client, meme.name);

        if (description) {
          indexed.memes.push({ ...meme, description });
          enrichedCount++;
          console.log(`[${i + 1}/${total}] Enriched: "${meme.name}"`);
        } else {
          console.warn(`[${i + 1}/${total}] Пустой ответ для: "${meme.name}"`);
        }
        break;
      } catch (error: unknown) {
        if (error instanceof OpenAI.APIError && error.status === 429) {
          const retryAfter =
            Number(error.headers?.["retry-after"]) || 60;
          console.warn(
            `[${i + 1}/${total}] Rate limit (попытка ${attempt + 1}/${MAX_RETRIES}), ожидание ${retryAfter} сек...`,
          );
          await sleep(retryAfter * 1000);
        } else {
          console.error(
            `[${i + 1}/${total}] Ошибка для "${meme.name}":`,
            error,
          );
          break;
        }
      }
    }

    // Сохраняем прогресс каждые N мемов
    if (enrichedCount > 0 && enrichedCount % SAVE_EVERY === 0) {
      saveIndexedMemes(indexed);
      console.log(`Прогресс сохранён (${enrichedCount} обогащено)`);
    }

    await sleep(DELAY_MS);
  }

  // Финальное сохранение
  saveIndexedMemes(indexed);
  console.log(`Готово! Обогащено ${enrichedCount} мемов из ${toEnrich.length}`);
}

main().catch((error) => {
  console.error("Ошибка обогащения мемов:", error);
  process.exit(1);
});
