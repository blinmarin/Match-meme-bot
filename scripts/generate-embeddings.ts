import { readFileSync, writeFileSync } from "fs";
import { config } from "../src/config.ts";
import { sleep, getContentType, getDataPaths } from "../src/utils.ts";
import { embedText } from "../src/services/embedding.ts";
import type { IndexedMemesFile } from "../src/types.ts";

const DELAY_MS = 200;
const SAVE_EVERY = 10;

function loadIndexedMemes(path: string): IndexedMemesFile {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

function saveIndexedMemes(data: IndexedMemesFile, path: string): void {
  data.lastUpdated = new Date().toISOString();
  data.model = config.hf.model;
  data.dimensions = config.hf.embeddingDimensions;
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

async function main() {
  const contentType = getContentType();
  const paths = getDataPaths(contentType);
  console.log(`Генерация эмбеддингов для ${contentType === "gif" ? "GIF" : "мемов"}...`);

  const data = loadIndexedMemes(paths.indexed);
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
      saveIndexedMemes(data, paths.indexed);
      console.log(`Прогресс сохранён (${total} мемов)`);
      process.exit(1);
    }

    if (generatedCount > 0 && generatedCount % SAVE_EVERY === 0) {
      saveIndexedMemes(data, paths.indexed);
      console.log(`Прогресс сохранён`);
    }

    await sleep(DELAY_MS);
  }

  saveIndexedMemes(data, paths.indexed);
  console.log(
    `Готово! Сгенерировано ${generatedCount} эмбеддингов, всего ${total} мемов`,
  );
}

main().catch((error) => {
  console.error("Ошибка генерации эмбеддингов:", error);
  process.exit(1);
});
