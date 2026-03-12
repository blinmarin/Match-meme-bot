import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { parse } from "node-html-parser";
import { config } from "../src/config.ts";
import { sleep, getContentType, getDataPaths } from "../src/utils.ts";
import type { BaseMeme, RawMemesFile } from "../src/types.ts";

const DELAY_MS = 1000; // Пауза между запросами к Imgflip

// Конфигурация парсинга для разных типов контента
const PARSE_CONFIG = {
  meme: {
    sourceUrl: config.imgflip.templatesUrl,
    extractId: (href: string) => href.replace("/meme/", ""),
    transformUrl: (src: string) =>
      src.startsWith("//") ? `https:${src}` : src,
    source: "imgflip-meme-parse",
    label: "мемов",
  },
  gif: {
    sourceUrl: config.imgflip.gifTemplatesUrl,
    // href вида /memetemplate/628238188/John-Hamm-dancing → извлекаем числовой ID
    extractId: (href: string) => {
      const match = href.match(/\/memetemplate\/(\d+)\//);
      return match ? match[1] : "";
    },
    transformUrl: (src: string) => {
      // //i.imgflip.com/2/ae1bos.jpg → https://i.imgflip.com/ae1bos.mp4
      const url = src.startsWith("//") ? `https:${src}` : src;
      return url.replace(/\/\d+\//, "/").replace(/\.jpg$/, ".mp4");
    },
    source: "imgflip-gif-parse",
    label: "GIF",
  },
};

const contentType = getContentType();
const parseConfig = PARSE_CONFIG[contentType];
const paths = getDataPaths(contentType);

async function fetchPage(page: number): Promise<BaseMeme[]> {
  const url =
    page === 1
      ? parseConfig.sourceUrl
      : `${parseConfig.sourceUrl}?page=${page}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Imgflip вернул ${response.status} для страницы ${page}`);
  }

  const html = await response.text();
  const root = parse(html);
  const boxes = root.querySelectorAll(".mt-box");

  return boxes
    .map((box) => {
      const link = box.querySelector(".mt-title a");
      const img = box.querySelector(".mt-img-wrap img");

      if (!link || !img) return null;

      const name = link.text.trim();
      const href = link.getAttribute("href") ?? "";
      const src = img.getAttribute("src") ?? "";

      const id = parseConfig.extractId(href);
      const imageUrl = parseConfig.transformUrl(src);

      if (!id || !name || !imageUrl) return null;

      return { id, name, url: imageUrl };
    })
    .filter((meme): meme is BaseMeme => meme !== null);
}

async function main() {
  console.log(`Парсинг ${parseConfig.label} из Imgflip...`);

  const allMemes: BaseMeme[] = [];
  let page = 1;

  while (true) {
    const memes = await fetchPage(page);

    if (memes.length === 0) {
      break;
    }

    allMemes.push(...memes);
    console.log(
      `[Страница ${page}] Найдено ${memes.length} ${parseConfig.label} (всего: ${allMemes.length})`,
    );

    page++;
    await sleep(DELAY_MS);
  }

  const result: RawMemesFile = {
    lastUpdated: new Date().toISOString(),
    source: parseConfig.source,
    count: allMemes.length,
    memes: allMemes,
  };

  const outputPath = paths.raw;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

  console.log(
    `Готово! Сохранено ${allMemes.length} ${parseConfig.label} в ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(`Ошибка парсинга ${parseConfig.label}:`, error);
  process.exit(1);
});
