import { config } from "./config.ts";

/** Тип контента: мемы или гифки */
export type ContentType = "meme" | "gif";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Определяет тип контента из аргументов командной строки (--type gif/meme) */
export function getContentType(): ContentType {
  const typeIndex = process.argv.indexOf("--type");
  if (typeIndex !== -1 && process.argv[typeIndex + 1] === "gif") {
    return "gif";
  }
  return "meme";
}

/** Возвращает пути к файлам данных в зависимости от типа контента */
export function getDataPaths(type: ContentType): { raw: string; indexed: string } {
  return type === "gif"
    ? { raw: config.data.rawGifsPath, indexed: config.data.indexedGifsPath }
    : { raw: config.data.rawMemesPath, indexed: config.data.indexedMemesPath };
}
