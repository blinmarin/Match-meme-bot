import { readFileSync } from "fs";
import { config } from "../config.ts";
import type { EnrichedMeme, IndexedMemesFile } from "../types.ts";

let memesArray: EnrichedMeme[] = [];

export function loadMemes(): void {
  let data: IndexedMemesFile;

  try {
    const raw = readFileSync(config.data.indexedMemesPath, "utf-8");
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Файл ${config.data.indexedMemesPath} не найден. Запусти: npm run fetch-memes && npm run enrich && npm run embed`,
    );
  }

  const valid = data.memes.filter(
    (m): m is EnrichedMeme =>
      Boolean(m.description && m.embedding && m.embedding.length > 0),
  );

  if (valid.length === 0) {
    throw new Error(
      `В ${config.data.indexedMemesPath} нет мемов с эмбеддингами. Запусти: npm run enrich && npm run embed`,
    );
  }

  memesArray = valid;
  console.log(`Загружено ${memesArray.length} мемов с эмбеддингами`);
}

export function getAllMemes(): EnrichedMeme[] {
  return memesArray;
}
