import { parse } from "node-html-parser";
import { config } from "../src/config.ts";
import { sleep, getContentType } from "../src/utils.ts";
import { insertMedia, closePool } from "../src/services/db.ts";

const DELAY_MS = 1000; // Пауза между запросами страниц к Imgflip
const DOWNLOAD_DELAY_MS = 100; // Пауза между скачиванием файлов

// Конфигурация парсинга для разных типов контента
const PARSE_CONFIG = {
  template: {
    sourceUrl: config.imgflip.templatesUrl,
    extractId: (href: string) => href.replace("/meme/", ""),
    transformUrl: (src: string) =>
      src.startsWith("//") ? `https:${src}` : src,
    label: "шаблонов",
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
    label: "GIF",
  },
};

interface ParsedItem {
  id: string;
  name: string;
  url: string;
}

const contentType = getContentType();
const parseConfig = PARSE_CONFIG[contentType];

async function fetchPage(page: number): Promise<ParsedItem[]> {
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
    .filter((item): item is ParsedItem => item !== null);
}

/** Скачивает файл по URL и возвращает Buffer */
async function downloadFile(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Ошибка скачивания ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  console.log(`Парсинг ${parseConfig.label} из Imgflip...`);

  let totalParsed = 0;
  let totalInserted = 0;
  let page = 1;

  while (true) {
    const items = await fetchPage(page);

    if (items.length === 0) break;

    for (const item of items) {
      try {
        const imageData = await downloadFile(item.url);
        const inserted = await insertMedia(item.id, contentType, item.name, imageData);
        if (inserted) totalInserted++;
        totalParsed++;
        await sleep(DOWNLOAD_DELAY_MS);
      } catch (error) {
        console.error(`Ошибка для "${item.name}":`, error);
      }
    }

    console.log(
      `[Страница ${page}] ${items.length} ${parseConfig.label} (всего: ${totalParsed}, новых: ${totalInserted})`,
    );

    page++;
    await sleep(DELAY_MS);
  }

  await closePool();
  console.log(
    `Готово! Обработано ${totalParsed} ${parseConfig.label}, добавлено ${totalInserted} новых`,
  );
}

main().catch((error) => {
  console.error(`Ошибка парсинга ${parseConfig.label}:`, error);
  process.exit(1);
});
