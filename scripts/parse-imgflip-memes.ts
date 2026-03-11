import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { parse } from "node-html-parser";
import { config } from "../src/config.ts";
import { sleep } from "../src/utils.ts";
import type { BaseMeme, RawMemesFile } from "../src/types.ts";

const DELAY_MS = 1000; // Пауза между запросами к Imgflip

async function fetchPage(page: number): Promise<BaseMeme[]> {
  const url = page === 1 ? config.imgflip.templatesUrl : `${config.imgflip.templatesUrl}?page=${page}`;
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

      // ID из href: /meme/Drake-Hotline-Bling → Drake-Hotline-Bling
      const id = href.replace("/meme/", "");
      // URL картинки: //i.imgflip.com/4/30b1gx.jpg → https://i.imgflip.com/4/30b1gx.jpg
      const imageUrl = src.startsWith("//") ? `https:${src}` : src;

      if (!id || !name || !imageUrl) return null;

      return { id, name, url: imageUrl };
    })
    .filter((meme): meme is BaseMeme => meme !== null);
}

async function main() {
  console.log("Парсинг мемов из Imgflip...");

  const allMemes: BaseMeme[] = [];
  let page = 1;

  while (true) {
    const memes = await fetchPage(page);

    if (memes.length === 0) {
      break;
    }

    allMemes.push(...memes);
    console.log(
      `[Страница ${page}] Найдено ${memes.length} мемов (всего: ${allMemes.length})`,
    );

    page++;
    await sleep(DELAY_MS);
  }

  const result: RawMemesFile = {
    lastUpdated: new Date().toISOString(),
    source: "imgflip-scrape",
    count: allMemes.length,
    memes: allMemes,
  };

  const outputPath = config.data.rawMemesPath;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

  console.log(`Готово! Сохранено ${allMemes.length} мемов в ${outputPath}`);
}

main().catch((error) => {
  console.error("Ошибка парсинга мемов:", error);
  process.exit(1);
});
