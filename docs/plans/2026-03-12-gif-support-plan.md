# GIF Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Добавить поддержку GIF (MP4) из Imgflip: парсинг, обогащение, эмбеддинги и выбор мем/GIF в боте.

**Architecture:** Переиспользуем существующие скрипты через параметр `--type gif|meme`. В боте новый UX: пользователь описывает ситуацию → бот вычисляет эмбеддинг и показывает кнопки "Мем"/"GIF" → по нажатию ищет в нужной базе и отправляет результат.

**Tech Stack:** TypeScript, grammY (InlineKeyboard + callback queries), Groq API, HuggingFace Inference API, node-html-parser

---

### Task 1: Конфиг — добавить пути и URL для GIF

**Files:**
- Modify: `src/config.ts`

**Step 1: Добавить GIF-конфигурацию**

В `config.imgflip` добавить `gifTemplatesUrl`, в `config.data` добавить `rawGifsPath` и `indexedGifsPath`:

```typescript
imgflip: {
  apiUrl: "https://api.imgflip.com/get_memes",
  templatesUrl: "https://imgflip.com/memetemplates",
  gifTemplatesUrl: "https://imgflip.com/gif-templates",
},
data: {
  rawMemesPath: "data/memes.json",
  indexedMemesPath: "data/memes-indexed.json",
  rawGifsPath: "data/gifs.json",
  indexedGifsPath: "data/gifs-indexed.json",
},
```

**Step 2: Проверка типов**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Коммит**

```bash
git add src/config.ts
git commit -m "feat: добавить GIF-пути и URL в конфиг"
```

---

### Task 2: Утилита — парсинг аргумента --type и выбор путей

**Files:**
- Modify: `src/utils.ts`

**Step 1: Добавить хелперы**

Добавить в `src/utils.ts` функцию для парсинга `--type` из аргументов и функцию для выбора путей:

```typescript
import { config } from "./config.ts";

export type ContentType = "meme" | "gif";

export function getContentType(): ContentType {
  const typeIndex = process.argv.indexOf("--type");
  if (typeIndex !== -1 && process.argv[typeIndex + 1] === "gif") {
    return "gif";
  }
  return "meme";
}

export function getDataPaths(type: ContentType): { raw: string; indexed: string } {
  return type === "gif"
    ? { raw: config.data.rawGifsPath, indexed: config.data.indexedGifsPath }
    : { raw: config.data.rawMemesPath, indexed: config.data.indexedMemesPath };
}
```

**Step 2: Проверка типов**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Коммит**

```bash
git add src/utils.ts
git commit -m "feat: хелперы getContentType и getDataPaths"
```

---

### Task 3: Параметризовать скрипт парсинга

**Files:**
- Modify: `scripts/parse-imgflip-memes.ts`

**Step 1: Добавить конфиг парсинга по типу контента**

В начале файла, после импортов, добавить маппинг конфигураций парсинга и использовать `getContentType()` + `getDataPaths()`:

```typescript
import { getContentType, getDataPaths } from "../src/utils.ts";

const PARSE_CONFIG = {
  meme: {
    sourceUrl: config.imgflip.templatesUrl,
    extractId: (href: string) => href.replace("/meme/", ""),
    transformUrl: (src: string) => (src.startsWith("//") ? `https:${src}` : src),
    source: "imgflip-scrape",
    label: "мемов",
  },
  gif: {
    sourceUrl: config.imgflip.gifTemplatesUrl,
    extractId: (href: string) => {
      const match = href.match(/\/memetemplate\/(\d+)\//);
      return match ? match[1] : "";
    },
    transformUrl: (src: string) => {
      // //i.imgflip.com/2/ae1bos.jpg → https://i.imgflip.com/ae1bos.mp4
      const url = src.startsWith("//") ? `https:${src}` : src;
      return url.replace(/\/\d+\//, "/").replace(/\.jpg$/, ".mp4");
    },
    source: "imgflip-gif-scrape",
    label: "GIF",
  },
};
```

**Step 2: Обновить fetchPage**

Передавать `parseConfig` в `fetchPage` вместо хардкода:

```typescript
const contentType = getContentType();
const parseConfig = PARSE_CONFIG[contentType];
const paths = getDataPaths(contentType);
```

В `fetchPage` заменить:
- `config.imgflip.templatesUrl` → `parseConfig.sourceUrl`
- `href.replace("/meme/", "")` → `parseConfig.extractId(href)`
- логику формирования `imageUrl` → `parseConfig.transformUrl(src)`

В `main()` заменить:
- `source: "imgflip-scrape"` → `source: parseConfig.source`
- `config.data.rawMemesPath` → `paths.raw`
- строки логов: использовать `parseConfig.label`

**Step 3: Проверка типов**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Коммит**

```bash
git add scripts/parse-imgflip-memes.ts
git commit -m "feat: параметризовать скрипт парсинга для мемов и GIF"
```

---

### Task 4: Параметризовать скрипт обогащения

**Files:**
- Modify: `scripts/enrich-memes.ts`

**Step 1: Добавить поддержку --type**

Добавить импорт `getContentType`, `getDataPaths`. Использовать `paths.raw` и `paths.indexed` вместо `config.data.rawMemesPath` и `config.data.indexedMemesPath`:

```typescript
import { getContentType, getDataPaths } from "../src/utils.ts";

// В начале main():
const contentType = getContentType();
const paths = getDataPaths(contentType);
```

Заменить все обращения к путям:
- `loadRawMemes()` → принимает `paths.raw`
- `loadIndexedMemes()` → принимает `paths.indexed`
- `saveIndexedMemes()` → принимает `paths.indexed`

Либо проще: превратить `loadRawMemes`, `loadIndexedMemes`, `saveIndexedMemes` в функции с параметром `path`:

```typescript
function loadRawMemes(path: string): RawMemesFile {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

function loadIndexedMemes(path: string): IndexedMemesFile | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveIndexedMemes(data: IndexedMemesFile, path: string): void {
  data.lastUpdated = new Date().toISOString();
  data.count = data.memes.length;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}
```

В `main()` передавать `paths.raw` и `paths.indexed` в эти функции. Обновить логи — добавить `contentType` для наглядности:

```typescript
console.log(`Обогащение ${contentType === "gif" ? "GIF" : "мемов"}...`);
```

**Step 2: Проверка типов**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Коммит**

```bash
git add scripts/enrich-memes.ts
git commit -m "feat: параметризовать скрипт обогащения для мемов и GIF"
```

---

### Task 5: Параметризовать скрипт эмбеддингов

**Files:**
- Modify: `scripts/generate-embeddings.ts`

**Step 1: Добавить поддержку --type**

Аналогично Task 4. Добавить `getContentType`, `getDataPaths`. Заменить `config.data.indexedMemesPath` на `paths.indexed`:

```typescript
import { getContentType, getDataPaths } from "../src/utils.ts";

// В начале main():
const contentType = getContentType();
const paths = getDataPaths(contentType);
```

Обновить `loadIndexedMemes` и `saveIndexedMemes` — принимать `path` параметром (аналогично Task 4).

**Step 2: Проверка типов**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Коммит**

```bash
git add scripts/generate-embeddings.ts
git commit -m "feat: параметризовать скрипт эмбеддингов для мемов и GIF"
```

---

### Task 6: npm-скрипты для GIF

**Files:**
- Modify: `package.json`

**Step 1: Добавить скрипты**

В секцию `scripts` добавить:

```json
"parse-gifs": "tsx scripts/parse-imgflip-memes.ts --type gif",
"enrich-gifs": "tsx scripts/enrich-memes.ts --type gif",
"embed-gifs": "tsx scripts/generate-embeddings.ts --type gif"
```

**Step 2: Коммит**

```bash
git add package.json
git commit -m "feat: npm-скрипты для GIF-пайплайна"
```

---

### Task 7: Сервис мемов — добавить загрузку GIF

**Files:**
- Modify: `src/services/meme.ts`

**Step 1: Добавить loadGifs() и getAllGifs()**

Добавить вторую переменную `gifsArray` и функции `loadGifs()` / `getAllGifs()`, аналогичные существующим для мемов. Обе функции (`loadMemes` и `loadGifs`) используют одну и ту же логику — можно вынести в приватную функцию:

```typescript
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
```

**Step 2: Проверка типов**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Коммит**

```bash
git add src/services/meme.ts
git commit -m "feat: загрузка GIF-базы при старте бота"
```

---

### Task 8: Хендлер — новый UX с инлайн-клавиатурой

**Files:**
- Modify: `src/handlers/message.ts`

**Step 1: Переписать хендлер**

Полная замена содержимого `src/handlers/message.ts`:

```typescript
import { Context, InlineKeyboard } from "grammy";
import { selectMeme } from "../services/ai.ts";
import { getAllMemes, getAllGifs } from "../services/meme.ts";
import { embedText, findTopCandidates } from "../services/embedding.ts";
import { config } from "../config.ts";
import type { EnrichedMeme } from "../types.ts";

const ERRORS = {
  EMBEDDING_ERROR: "Сервис поиска временно недоступен, попробуй позже",
  NO_RESULT: "Не могу подобрать результат, попробуй описать ситуацию иначе",
  NO_PENDING: "Сначала опиши ситуацию",
  GENERAL: "Что-то пошло не так, попробуй ещё раз",
};

const pendingSituations = new Map<number, { text: string; embedding: number[] }>();

const keyboard = new InlineKeyboard()
  .text("Мем", "pick:meme")
  .text("GIF", "pick:gif");

export async function handleMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text || text.startsWith("/") || text.length > config.maxMessageLength) {
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedText(text);
    } catch (error) {
      console.error("Ошибка эмбеддинга:", error);
      await ctx.reply(ERRORS.EMBEDDING_ERROR);
      return;
    }

    pendingSituations.set(chatId, { text, embedding: queryEmbedding });

    await ctx.reply("Что подобрать?", { reply_markup: keyboard });
  } catch (error) {
    console.error("Ошибка обработки сообщения:", error);
    await ctx.reply(ERRORS.GENERAL);
  }
}

export async function handleCallback(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const data = ctx.callbackQuery?.data;

  if (!chatId || !data) return;

  const pending = pendingSituations.get(chatId);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: ERRORS.NO_PENDING });
    return;
  }

  await ctx.answerCallbackQuery();
  pendingSituations.delete(chatId);

  const isGif = data === "pick:gif";
  const collection = isGif ? getAllGifs() : getAllMemes();

  try {
    const candidates = findTopCandidates(
      pending.embedding,
      collection,
      config.search.topN,
    );

    if (candidates.length === 0) {
      await ctx.reply(ERRORS.NO_RESULT);
      return;
    }

    let result = candidates[0];
    try {
      const selectedNumber = await selectMeme(pending.text, candidates);
      if (selectedNumber) {
        result = candidates[selectedNumber - 1];
      }
    } catch (error) {
      console.error("Ошибка AI, используем top-1 по сходству:", error);
    }

    if (isGif) {
      await ctx.replyWithAnimation(result.url);
    } else {
      await ctx.replyWithPhoto(result.url);
    }
  } catch (error) {
    console.error("Ошибка выбора контента:", error);
    await ctx.reply(ERRORS.GENERAL);
  }
}
```

**Step 2: Проверка типов**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Коммит**

```bash
git add src/handlers/message.ts
git commit -m "feat: UX с инлайн-клавиатурой для выбора мем/GIF"
```

---

### Task 9: Бот — подключить callback handler и обновить /start

**Files:**
- Modify: `src/bot.ts`
- Modify: `src/index.ts`

**Step 1: Обновить bot.ts**

Добавить импорт `handleCallback`, зарегистрировать обработчик callback query, обновить приветствие:

```typescript
import { Bot } from "grammy";
import { config } from "./config.ts";
import { handleMessage, handleCallback } from "./handlers/message.ts";

export const bot = new Bot(config.telegram.token);

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! Я подберу мем или GIF под твою ситуацию.\n\n" +
    "Просто опиши что произошло — я предложу выбрать формат!"
  );
});

bot.on("message:text", handleMessage);
bot.on("callback_query:data", handleCallback);

bot.catch((err) => {
  console.error("Ошибка бота:", err);
});
```

**Step 2: Обновить index.ts — загружать GIF-базу**

```typescript
import { bot } from "./bot.ts";
import { loadMemes, loadGifs } from "./services/meme.ts";

async function main() {
  console.log("Starting Meme Match Bot...");

  loadMemes();
  loadGifs();

  process.once("SIGINT", () => bot.stop());
  process.once("SIGTERM", () => bot.stop());

  bot.start();
  console.log("Bot is running...");
}

main().catch(console.error);
```

**Step 3: Проверка типов**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Коммит**

```bash
git add src/bot.ts src/index.ts
git commit -m "feat: подключить GIF-хендлер и загрузку GIF-базы"
```

---

### Task 10: Финальная проверка

**Step 1: Проверка типов всего проекта**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 2: Проверка npm-скриптов (сухой запуск)**

Run: `npm run parse-memes -- --help 2>&1 || true` (убедиться что скрипт запускается)
Run: `npm run parse-gifs -- --help 2>&1 || true`

**Step 3: Итоговый коммит (если нужны правки)**

Если были финальные правки — закоммитить.
