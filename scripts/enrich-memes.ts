import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import OpenAI from "openai";

const INPUT_PATH = "data/memes.json";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const DELAY_MS = 2000; // Пауза между запросами (30 req/min у Groq)
const SAVE_EVERY = 10; // Сохранять прогресс каждые N мемов
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are an internet meme expert. For the given meme name, write a concise one-line description in English.

Include: what is depicted, what emotions it conveys, typical situations where it's used, and relevant keywords.

Format: "{meme_name} — description"

Write nothing else. Only one line.`;

interface Meme {
  id: string;
  name: string;
  url: string;
  description?: string;
}

interface MemesFile {
  lastUpdated: string;
  source: string;
  count: number;
  memes: Meme[];
}

function loadMemes(): MemesFile {
  const raw = readFileSync(INPUT_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveMemes(data: MemesFile): void {
  data.lastUpdated = new Date().toISOString();
  writeFileSync(INPUT_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichMeme(
  client: OpenAI,
  memeName: string,
): Promise<string | null> {
  const response = await client.chat.completions.create({
    model: GROQ_MODEL,
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
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("Ошибка: переменная окружения GROQ_API_KEY не задана");
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const data = loadMemes();
  const total = data.memes.length;
  const toEnrich = data.memes.filter((m) => !m.description);

  console.log(
    `Загружено ${total} мемов, нужно обогатить: ${toEnrich.length}`,
  );

  if (toEnrich.length === 0) {
    console.log("Все мемы уже обогащены!");
    return;
  }

  let enrichedCount = 0;

  for (const meme of toEnrich) {
    const index = data.memes.indexOf(meme) + 1;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const description = await enrichMeme(client, meme.name);

        if (description) {
          meme.description = description;
          enrichedCount++;
          console.log(`[${index}/${total}] Enriched: "${meme.name}"`);
        } else {
          console.warn(`[${index}/${total}] Пустой ответ для: "${meme.name}"`);
        }
        break;
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          "status" in error &&
          (error as { status: number }).status === 429
        ) {
          const retryAfter =
            "headers" in error
              ? Number(
                  (error as { headers: Record<string, string> }).headers[
                    "retry-after"
                  ],
                ) || 60
              : 60;
          console.warn(
            `[${index}/${total}] Rate limit (попытка ${attempt + 1}/${MAX_RETRIES}), ожидание ${retryAfter} сек...`,
          );
          await sleep(retryAfter * 1000);
        } else {
          console.error(
            `[${index}/${total}] Ошибка для "${meme.name}":`,
            error,
          );
          break;
        }
      }
    }

    // Сохраняем прогресс каждые N мемов
    if (enrichedCount > 0 && enrichedCount % SAVE_EVERY === 0) {
      saveMemes(data);
      console.log(`Прогресс сохранён (${enrichedCount} обогащено)`);
    }

    await sleep(DELAY_MS);
  }

  // Финальное сохранение
  saveMemes(data);
  console.log(`Готово! Обогащено ${enrichedCount} мемов из ${toEnrich.length}`);
}

main().catch((error) => {
  console.error("Ошибка обогащения мемов:", error);
  process.exit(1);
});
