import { readFileSync } from "fs";
import { config } from "../config.ts";
import type { EnrichedMeme, IndexedMemesFile } from "../types.ts";

let memesArray: EnrichedMeme[] = [];
let gifsArray: EnrichedMeme[] = [];

function loadCollection(path: string, label: string): EnrichedMeme[] {
  let data: IndexedMemesFile;

  try {
    const raw = readFileSync(path, "utf-8");
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Файл ${path} не найден`);
  }

  const valid = data.memes.filter(
    (m): m is EnrichedMeme =>
      Boolean(m.description && m.embedding && m.embedding.length > 0),
  );

  if (valid.length === 0) {
    throw new Error(`В ${path} нет записей с эмбеддингами`);
  }

  console.log(`Загружено ${valid.length} ${label} с эмбеддингами`);
  return valid;
}

export function loadMemes(): void {
  memesArray = loadCollection(config.data.indexedMemesPath, "мемов");
}

export function loadGifs(): void {
  gifsArray = loadCollection(config.data.indexedGifsPath, "GIF");
}

export function getAllMemes(): EnrichedMeme[] {
  return memesArray;
}

export function getAllGifs(): EnrichedMeme[] {
  return gifsArray;
}
