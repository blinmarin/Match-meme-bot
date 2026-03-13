/** Тип контента: шаблоны мемов или гифки */
export type ContentType = "template" | "gif";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Определяет тип контента из аргументов командной строки (--type gif/template) */
export function getContentType(): ContentType {
  const typeIndex = process.argv.indexOf("--type");
  if (typeIndex !== -1 && process.argv[typeIndex + 1] === "gif") {
    return "gif";
  }
  return "template";
}
