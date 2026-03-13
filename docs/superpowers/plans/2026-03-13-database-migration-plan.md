# Миграция на PostgreSQL + pgvector — План реализации

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести хранение мемов/GIF с JSON-файлов на PostgreSQL + pgvector с хранением бинарных данных и векторным поиском на стороне БД.

**Architecture:** PostgreSQL 17 + pgvector, одна таблица `media`. Скрипты пайплайна (parse/enrich/embed) переписываются на работу с БД. Runtime-поиск через pgvector cosine distance. Отправка через `InputFile(Buffer)` вместо URL.

**Tech Stack:** PostgreSQL 17, pgvector, pg (node-postgres), Docker Compose, grammY InputFile

**Spec:** `docs/superpowers/specs/2026-03-13-database-migration-design.md`

---

## Структура файлов

**Создать:**
- `docker-compose.yml` — PostgreSQL для локальной разработки
- `.dockerignore` — исключения для Docker-сборки
- `Dockerfile` — multi-stage сборка бота
- `migrations/001-init.sql` — CREATE EXTENSION + CREATE TABLE
- `scripts/migrate.ts` — запуск миграций
- `src/services/db.ts` — пул соединений и функции работы с media

**Изменить:**
- `src/config.ts` — добавить `db`, убрать `data` и `imgflip.apiUrl`
- `src/types.ts` — добавить `MediaCandidate`, убрать JSON-файловые типы
- `src/utils.ts` — убрать `getDataPaths`
- `src/services/embedding.ts` — убрать `cosineSimilarity`, `findTopCandidates`
- `src/services/ai.ts` — обновить типы (`MediaCandidate` вместо `EnrichedMeme`)
- `src/handlers/message.ts` — переписать на SQL-запросы через db.ts
- `src/index.ts` — убрать загрузку из файлов, добавить проверку БД
- `scripts/parse-imgflip.ts` — переписать на скачивание + INSERT в БД
- `scripts/enrich-memes.ts` — переписать на SELECT/UPDATE из БД
- `scripts/generate-embeddings.ts` — переписать на SELECT/UPDATE из БД
- `package.json` — обновить скрипты

**Удалить:**
- `src/services/meme.ts`
- `scripts/fetch-memes.ts`

---

## Chunk 1: Инфраструктура и БД

### Task 1: Docker Compose + зависимости

**Files:**
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Modify: `package.json`

- [ ] **Step 1: Создать docker-compose.yml**

```yaml
services:
  db:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_DB: memebot
      POSTGRES_USER: memebot
      POSTGRES_PASSWORD: memebot
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 2: Создать .dockerignore**

```
node_modules
data/
.env
.git
.gitignore
docs/
```

- [ ] **Step 3: Установить pg**

Run: `pnpm add pg && pnpm add -D @types/pg`

- [ ] **Step 4: Добавить DATABASE_URL в .env**

Добавить строку в `.env`:
```
DATABASE_URL=postgresql://memebot:memebot@localhost:5432/memebot
```

- [ ] **Step 5: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

### Task 2: Конфиг — добавить db секцию

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Добавить секцию db**

В `src/config.ts` добавить после секции `hf`:

```typescript
db: {
  get connectionString(): string {
    return required("DATABASE_URL");
  },
},
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

### Task 3: Миграция БД

**Files:**
- Create: `migrations/001-init.sql`
- Create: `scripts/migrate.ts`
- Modify: `package.json`

- [ ] **Step 1: Создать migrations/001-init.sql**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS media (
  id          SERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  image_data  BYTEA,
  embedding   vector(384)
);

CREATE INDEX IF NOT EXISTS idx_media_type ON media(type);
```

- [ ] **Step 2: Создать scripts/migrate.ts**

```typescript
import { readFileSync, readdirSync } from "fs";
import pg from "pg";
import { config } from "../src/config.ts";

async function main() {
  const client = new pg.Client({ connectionString: config.db.connectionString });
  await client.connect();

  const files = readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`Выполняю ${file}...`);
    const sql = readFileSync(`migrations/${file}`, "utf-8");
    await client.query(sql);
    console.log(`${file} — готово`);
  }

  await client.end();
  console.log("Миграции завершены");
}

main().catch((error) => {
  console.error("Ошибка миграции:", error);
  process.exit(1);
});
```

- [ ] **Step 3: Добавить npm-скрипты в package.json**

```json
"db:up": "docker compose up -d",
"db:down": "docker compose down",
"migrate": "tsx scripts/migrate.ts"
```

- [ ] **Step 4: Проверка типов**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

- [ ] **Step 5: Проверка работоспособности**

Run: `pnpm db:up && sleep 3 && pnpm migrate`
Expected: миграция успешно выполняется, таблица создана

---

### Task 4: DB сервис

**Files:**
- Create: `src/services/db.ts`

- [ ] **Step 1: Создать src/services/db.ts**

```typescript
import pg from "pg";
import { config } from "../config.ts";

const pool = new pg.Pool({ connectionString: config.db.connectionString });

/** Проверка подключения к БД */
export async function checkConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("Подключение к БД установлено");
  } finally {
    client.release();
  }
}

/** Поиск top-N медиа по косинусному сходству через pgvector */
export async function searchMedia(
  type: string,
  queryEmbedding: number[],
  limit: number,
): Promise<{ id: number; name: string; description: string; image_data: Buffer; type: string }[]> {
  const embeddingStr = `[${queryEmbedding.join(",")}]`;
  const result = await pool.query(
    `SELECT id, name, description, image_data, type
     FROM media
     WHERE type = $1 AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    [type, embeddingStr, limit],
  );
  return result.rows;
}

/** Вставка медиа (пропускает если external_id уже существует) */
export async function insertMedia(
  externalId: string,
  type: string,
  name: string,
  imageData: Buffer,
): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO media (external_id, type, name, image_data)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (external_id) DO NOTHING`,
    [externalId, type, name, imageData],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Получить записи без описания */
export async function getMediaWithoutDescription(
  type: string,
): Promise<{ id: number; name: string }[]> {
  const result = await pool.query(
    "SELECT id, name FROM media WHERE type = $1 AND description IS NULL",
    [type],
  );
  return result.rows;
}

/** Обновить описание */
export async function updateDescription(
  id: number,
  description: string,
): Promise<void> {
  await pool.query("UPDATE media SET description = $1 WHERE id = $2", [
    description,
    id,
  ]);
}

/** Получить записи с описанием, но без эмбеддинга */
export async function getMediaWithoutEmbedding(
  type: string,
): Promise<{ id: number; name: string; description: string }[]> {
  const result = await pool.query(
    "SELECT id, name, description FROM media WHERE type = $1 AND description IS NOT NULL AND embedding IS NULL",
    [type],
  );
  return result.rows;
}

/** Обновить эмбеддинг */
export async function updateEmbedding(
  id: number,
  embedding: number[],
): Promise<void> {
  const embeddingStr = `[${embedding.join(",")}]`;
  await pool.query("UPDATE media SET embedding = $1::vector WHERE id = $2", [
    embeddingStr,
    id,
  ]);
}

/** Закрыть пул соединений */
export async function closePool(): Promise<void> {
  await pool.end();
}
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

## Chunk 2: Скрипты пайплайна

### Task 5: Типы — добавить MediaCandidate

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Добавить MediaCandidate**

Добавить в `src/types.ts`:

```typescript
/** Результат поиска из БД */
export interface MediaCandidate {
  id: number;
  name: string;
  description: string;
  image_data: Buffer;
  type: string;
}
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

### Task 6: Скрипт парсинга → БД

**Files:**
- Modify: `scripts/parse-imgflip.ts`

Скрипт переписывается: вместо сохранения в JSON, парсит HTML, скачивает изображения/mp4, и INSERT-ит в БД. Сохраняет `PARSE_CONFIG` и `getContentType()`.

- [ ] **Step 1: Переписать скрипт**

Полная замена содержимого `scripts/parse-imgflip.ts`:

```typescript
import { parse } from "node-html-parser";
import { config } from "../src/config.ts";
import { sleep, getContentType } from "../src/utils.ts";
import { insertMedia, closePool } from "../src/services/db.ts";

const DELAY_MS = 1000;
const DOWNLOAD_DELAY_MS = 100; // Пауза между скачиванием файлов

const PARSE_CONFIG = {
  meme: {
    sourceUrl: config.imgflip.templatesUrl,
    extractId: (href: string) => href.replace("/meme/", ""),
    transformUrl: (src: string) =>
      src.startsWith("//") ? `https:${src}` : src,
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

async function downloadImage(url: string): Promise<Buffer> {
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
        const imageData = await downloadImage(item.url);
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
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

### Task 7: Скрипт обогащения → БД

**Files:**
- Modify: `scripts/enrich-memes.ts`

Переписать: вместо чтения/записи JSON-файлов, SELECT записи без описания из БД, обогащает через Groq, UPDATE описание в БД.

- [ ] **Step 1: Переписать скрипт**

Полная замена содержимого `scripts/enrich-memes.ts`:

```typescript
import OpenAI from "openai";
import { config } from "../src/config.ts";
import { sleep, getContentType } from "../src/utils.ts";
import {
  getMediaWithoutDescription,
  updateDescription,
  closePool,
} from "../src/services/db.ts";

const DELAY_MS = 2000; // Пауза между запросами (30 req/min у Groq)
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are an internet meme expert. For the given meme name, write a concise one-line description in English.

Include: what is depicted, what emotions it conveys, typical situations where it's used, and relevant keywords.

Format: "{meme_name} — description"

Write nothing else. Only one line.`;

async function enrichMeme(
  client: OpenAI,
  memeName: string,
): Promise<string | null> {
  const response = await client.chat.completions.create({
    model: config.groq.model,
    temperature: 0.3,
    max_tokens: 200,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Meme: ${memeName}` },
    ],
  });

  return response.choices[0].message.content?.trim() ?? null;
}

async function main() {
  const contentType = getContentType();
  const label = contentType === "gif" ? "GIF" : "мемов";
  console.log(`Обогащение ${label}...`);

  const client = new OpenAI({
    apiKey: config.groq.apiKey,
    baseURL: config.groq.baseUrl,
  });

  const toEnrich = await getMediaWithoutDescription(contentType);
  const total = toEnrich.length;

  console.log(`Нужно обогатить: ${total}`);

  if (total === 0) {
    console.log("Все записи уже обогащены!");
    await closePool();
    return;
  }

  let enrichedCount = 0;

  for (let i = 0; i < total; i++) {
    const item = toEnrich[i];

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const description = await enrichMeme(client, item.name);

        if (description) {
          await updateDescription(item.id, description);
          enrichedCount++;
          console.log(`[${i + 1}/${total}] Enriched: "${item.name}"`);
        } else {
          console.warn(`[${i + 1}/${total}] Пустой ответ для: "${item.name}"`);
        }
        break;
      } catch (error: unknown) {
        if (error instanceof OpenAI.APIError && error.status === 429) {
          const retryAfter =
            Number(error.headers?.["retry-after"]) || 60;
          console.warn(
            `[${i + 1}/${total}] Rate limit (попытка ${attempt + 1}/${MAX_RETRIES}), ожидание ${retryAfter} сек...`,
          );
          await sleep(retryAfter * 1000);
        } else {
          console.error(
            `[${i + 1}/${total}] Ошибка для "${item.name}":`,
            error,
          );
          break;
        }
      }
    }

    await sleep(DELAY_MS);
  }

  await closePool();
  console.log(`Готово! Обогащено ${enrichedCount} из ${total}`);
}

main().catch((error) => {
  console.error("Ошибка обогащения:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

### Task 8: Скрипт эмбеддингов → БД

**Files:**
- Modify: `scripts/generate-embeddings.ts`

Переписать: SELECT записи без эмбеддинга из БД, генерирует через HF API, UPDATE эмбеддинг в БД.

- [ ] **Step 1: Переписать скрипт**

Полная замена содержимого `scripts/generate-embeddings.ts`:

```typescript
import { config } from "../src/config.ts";
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
  const label = contentType === "gif" ? "GIF" : "мемов";
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
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

## Chunk 3: Runtime бота

### Task 9: AI сервис — обновить типы

**Files:**
- Modify: `src/services/ai.ts`

Заменить `EnrichedMeme` на `MediaCandidate` в `selectMeme` и `formatCandidates`.

- [ ] **Step 1: Обновить импорты и типы**

В `src/services/ai.ts`:
- Заменить `import type { EnrichedMeme }` на `import type { MediaCandidate }`
- В `formatCandidates`: `candidates: EnrichedMeme[]` → `candidates: MediaCandidate[]`
- В `selectMeme`: `candidates: EnrichedMeme[]` → `candidates: MediaCandidate[]`

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

### Task 10: Хендлер — переписать на БД

**Files:**
- Modify: `src/handlers/message.ts`
- Modify: `src/services/embedding.ts`

Хендлер использует `searchMedia()` из db.ts вместо in-memory поиска. Из embedding.ts удаляются `cosineSimilarity` и `findTopCandidates`.

- [ ] **Step 1: Обновить embedding.ts**

Удалить из `src/services/embedding.ts`:
- `import type { EnrichedMeme }` (строка 3)
- Функцию `cosineSimilarity` (строки 55-67)
- Функцию `findTopCandidates` (строки 69-82)

Оставить только `embedText`.

- [ ] **Step 2: Переписать handler**

Полная замена содержимого `src/handlers/message.ts`:

```typescript
import { Context, InlineKeyboard, InputFile } from "grammy";
import { selectMeme } from "../services/ai.ts";
import { searchMedia } from "../services/db.ts";
import { embedText } from "../services/embedding.ts";
import { config } from "../config.ts";

const ERRORS = {
  EMBEDDING_ERROR: "Сервис поиска временно недоступен, попробуй позже",
  NO_RESULT: "Не могу подобрать результат, попробуй описать ситуацию иначе",
  NO_PENDING: "Сначала опиши ситуацию",
  GENERAL: "Что-то пошло не так, попробуй ещё раз",
};

const pendingSituations = new Map<
  number,
  { text: string; embedding: number[] }
>();

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
    // 1. Эмбеддинг запроса пользователя
    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedText(text);
    } catch (error) {
      console.error("Ошибка эмбеддинга:", error);
      await ctx.reply(ERRORS.EMBEDDING_ERROR);
      return;
    }

    // 2. Сохраняем ситуацию и предлагаем выбрать формат (мем или GIF)
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
  const mediaType = isGif ? "gif" : "meme";

  try {
    // 3. Поиск top-N кандидатов через pgvector cosine distance
    const candidates = await searchMedia(
      mediaType,
      pending.embedding,
      config.search.topN,
    );

    if (candidates.length === 0) {
      await ctx.reply(ERRORS.NO_RESULT);
      return;
    }

    // 4. AI выбирает лучший вариант из кандидатов (фоллбэк: top-1 по сходству)
    let result = candidates[0];
    try {
      const selectedNumber = await selectMeme(pending.text, candidates);
      if (selectedNumber) {
        result = candidates[selectedNumber - 1];
      }
    } catch (error) {
      console.error("Ошибка AI, используем top-1 по сходству:", error);
    }

    // 5. Отправка результата: фото для мемов, анимация для GIF
    if (isGif) {
      await ctx.replyWithAnimation(
        new InputFile(result.image_data, "animation.mp4"),
      );
    } else {
      await ctx.replyWithPhoto(
        new InputFile(result.image_data, "meme.jpg"),
      );
    }
  } catch (error) {
    console.error("Ошибка выбора контента:", error);
    await ctx.reply(ERRORS.GENERAL);
  }
}
```

- [ ] **Step 3: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

### Task 11: Точка входа — обновить index.ts

**Files:**
- Modify: `src/index.ts`

Убрать загрузку из файлов, добавить проверку подключения к БД.

- [ ] **Step 1: Переписать index.ts**

```typescript
import { bot } from "./bot.ts";
import { checkConnection } from "./services/db.ts";

async function main() {
  console.log("Starting Meme Match Bot...");

  await checkConnection();

  process.once("SIGINT", () => bot.stop());
  process.once("SIGTERM", () => bot.stop());

  bot.start();
  console.log("Bot is running...");
}

main().catch(console.error);
```

- [ ] **Step 2: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

## Chunk 4: Очистка и Docker

### Task 12: Очистка — удалить старый код

**Files:**
- Delete: `src/services/meme.ts`
- Delete: `scripts/fetch-memes.ts`
- Modify: `src/types.ts` — удалить неиспользуемые типы
- Modify: `src/utils.ts` — удалить `getDataPaths` и import config
- Modify: `src/config.ts` — удалить `config.data` и `config.imgflip.apiUrl`
- Modify: `package.json` — удалить скрипт `fetch-memes`

- [ ] **Step 1: Удалить файлы**

```bash
rm src/services/meme.ts scripts/fetch-memes.ts
```

- [ ] **Step 2: Очистить types.ts**

Оставить только `BaseMeme` (используется как ParsedItem в parse-imgflip.ts — нет, там уже свой ParsedItem) и `MediaCandidate`.

Проверить: `BaseMeme` больше нигде не используется (parse скрипт определяет свой `ParsedItem`). Удалить `BaseMeme`, `MemeWithDescription`, `EnrichedMeme`, `IndexedMeme`, `ImgflipResponse`, `RawMemesFile`, `IndexedMemesFile`.

Оставить только:

```typescript
/** Результат поиска из БД */
export interface MediaCandidate {
  id: number;
  name: string;
  description: string;
  image_data: Buffer;
  type: string;
}
```

- [ ] **Step 3: Очистить utils.ts**

Удалить `getDataPaths`, `ContentType`, и `import { config }`. Оставить только:

```typescript
/** Определяет тип контента из аргументов командной строки (--type gif/meme) */
export function getContentType(): "meme" | "gif" {
  const typeIndex = process.argv.indexOf("--type");
  if (typeIndex !== -1 && process.argv[typeIndex + 1] === "gif") {
    return "gif";
  }
  return "meme";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Очистить config.ts**

Удалить `config.data` (строки 44-49) и `config.imgflip.apiUrl` (строка 37). Секция imgflip станет:

```typescript
imgflip: {
  templatesUrl: "https://imgflip.com/memetemplates",
  gifTemplatesUrl: "https://imgflip.com/gif-templates",
},
```

- [ ] **Step 5: Обновить package.json**

Удалить скрипт `"fetch-memes"`.

- [ ] **Step 6: Проверка**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS

---

### Task 13: Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Создать Dockerfile**

```dockerfile
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=build /app ./

CMD ["pnpm", "start"]
```

- [ ] **Step 2: Проверка сборки**

Run: `docker build -t meme-bot .`
Expected: образ собирается без ошибок

- [ ] **Step 3: Финальная проверка всего проекта**

Run: `npx tsc --noEmit && pnpm lint`
Expected: PASS
