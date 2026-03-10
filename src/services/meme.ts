import { readFileSync } from "fs";

const MEMES_PATH = "data/memes-indexed.json";

export interface EnrichedMeme {
  id: string;
  name: string;
  url: string;
  description: string;
  embedding: number[];
}

interface IndexedMemesFile {
  lastUpdated: string;
  model: string;
  dimensions: number;
  count: number;
  memes: EnrichedMeme[];
}

let memesArray: EnrichedMeme[] = [];

export function loadMemes(): void {
  let data: IndexedMemesFile;

  try {
    const raw = readFileSync(MEMES_PATH, "utf-8");
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Файл ${MEMES_PATH} не найден. Запусти: npm run fetch-memes && npm run enrich && npm run embed`,
    );
  }

  const valid = data.memes.filter(
    (m) => m.description && m.embedding?.length > 0,
  );

  if (valid.length === 0) {
    throw new Error(
      `В ${MEMES_PATH} нет мемов с эмбеддингами. Запусти: npm run enrich && npm run embed`,
    );
  }

  memesArray = valid;
  console.log(`Загружено ${memesArray.length} мемов с эмбеддингами`);
}

export function getAllMemes(): EnrichedMeme[] {
  return memesArray;
}
