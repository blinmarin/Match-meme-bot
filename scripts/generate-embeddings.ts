import { readFileSync, writeFileSync } from "fs";
import { config } from "../src/config.ts";
import { sleep } from "../src/utils.ts";
import { embedText } from "../src/services/embedding.ts";
import type { IndexedMemesFile } from "../src/types.ts";

const DELAY_MS = 200;
const SAVE_EVERY = 10;

function loadIndexedMemes(): IndexedMemesFile {
  const raw = readFileSync(config.data.indexedMemesPath, "utf-8");
  return JSON.parse(raw);
}

function saveIndexedMemes(data: IndexedMemesFile): void {
  data.lastUpdated = new Date().toISOString();
  data.model = config.hf.model;
  data.dimensions = config.hf.embeddingDimensions;
  writeFileSync(
    config.data.indexedMemesPath,
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}

async function main() {
  const data = loadIndexedMemes();
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
    (m) => m.embedding?.length === config.hf.embeddingDimensions,
  ).length;
  console.log(
    `Загружено ${total} мемов, уже с эмбеддингами: ${alreadyEmbedded}`,
  );

  let generatedCount = 0;

  for (let i = 0; i < data.memes.length; i++) {
    const meme = data.memes[i];
    const index = i + 1;

    // Пропускаем если эмбеддинг уже есть
    if (meme.embedding?.length === config.hf.embeddingDimensions) {
      continue;
    }

    try {
      const embedding = await embedText(meme.description!);
      meme.embedding = embedding;
      generatedCount++;
      console.log(`[${index}/${total}] Embedded: "${meme.name}"`);
    } catch (error) {
      console.error(`[${index}/${total}] Ошибка для "${meme.name}":`, error);
      saveIndexedMemes(data);
      console.log(`Прогресс сохранён (${total} мемов)`);
      process.exit(1);
    }

    if (generatedCount > 0 && generatedCount % SAVE_EVERY === 0) {
      saveIndexedMemes(data);
      console.log(`Прогресс сохранён`);
    }

    await sleep(DELAY_MS);
  }

  saveIndexedMemes(data);
  console.log(
    `Готово! Сгенерировано ${generatedCount} эмбеддингов, всего ${total} мемов`,
  );
}

main().catch((error) => {
  console.error("Ошибка генерации эмбеддингов:", error);
  process.exit(1);
});
