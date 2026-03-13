import { sleep, getContentType } from "../src/utils.ts";
import { embedText } from "../src/services/embedding.ts";
import {
  getMediaWithoutEmbedding,
  updateEmbedding,
  closePool,
} from "../src/services/db.ts";

const DELAY_MS = 200;

async function main() {
  const contentType = getContentType();
  const label = contentType === "gif" ? "GIF" : "шаблонов";
  console.log(`Генерация эмбеддингов для ${label}...`);

  const toEmbed = await getMediaWithoutEmbedding(contentType);
  const total = toEmbed.length;

  console.log(`Нужно сгенерировать эмбеддинги: ${total}`);

  if (total === 0) {
    console.log("Все записи уже имеют эмбеддинги!");
    await closePool();
    return;
  }

  let generatedCount = 0;

  for (let i = 0; i < total; i++) {
    const item = toEmbed[i];

    try {
      const embedding = await embedText(item.description);
      await updateEmbedding(item.id, embedding);
      generatedCount++;
      console.log(`[${i + 1}/${total}] Embedded: "${item.name}"`);
    } catch (error) {
      console.error(`[${i + 1}/${total}] Ошибка для "${item.name}":`, error);
      await closePool();
      console.log(`Прогресс сохранён (${generatedCount} сгенерировано)`);
      process.exit(1);
    }

    await sleep(DELAY_MS);
  }

  await closePool();
  console.log(`Готово! Сгенерировано ${generatedCount} эмбеддингов`);
}

main().catch((error) => {
  console.error("Ошибка генерации эмбеддингов:", error);
  process.exit(1);
});
