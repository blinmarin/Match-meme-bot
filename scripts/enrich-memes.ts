import OpenAI from "openai";
import { config } from "../src/config.ts";
import { sleep, getContentType } from "../src/utils.ts";
import {
  getMediaWithoutDescription,
  updateDescription,
  closePool,
} from "../src/services/db.ts";

const DELAY_MS = 2000; // Пауза между запросами (30 req/min у Groq)
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are an internet meme expert. For the given meme name, write a concise one-line description in English.

Include: what is depicted, what emotions it conveys, typical situations where it's used, and relevant keywords.

Format: "{meme_name} — description"

Write nothing else. Only one line.`;

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
  const contentType = getContentType();
  const label = contentType === "gif" ? "GIF" : "шаблонов";
  console.log(`Обогащение ${label}...`);

  const client = new OpenAI({
    apiKey: config.groq.apiKey,
    baseURL: config.groq.baseUrl,
  });

  const toEnrich = await getMediaWithoutDescription(contentType);
  const total = toEnrich.length;

  console.log(`Нужно обогатить: ${total}`);

  if (total === 0) {
    console.log("Все записи уже обогащены!");
    await closePool();
    return;
  }

  let enrichedCount = 0;

  for (let i = 0; i < total; i++) {
    const item = toEnrich[i];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const description = await enrichMeme(client, item.name);

        if (description) {
          await updateDescription(item.id, description);
          enrichedCount++;
          console.log(`[${i + 1}/${total}] Enriched: "${item.name}"`);
        } else {
          console.warn(`[${i + 1}/${total}] Пустой ответ для: "${item.name}"`);
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
            `[${i + 1}/${total}] Ошибка для "${item.name}":`,
            error,
          );
          break;
        }
      }
    }

    await sleep(DELAY_MS);
  }

  await closePool();
  console.log(`Готово! Обогащено ${enrichedCount} из ${total}`);
}

main().catch((error) => {
  console.error("Ошибка обогащения:", error);
  process.exit(1);
});
