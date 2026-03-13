# Миграция на PostgreSQL + pgvector

## Цель

Перевести хранение мемов/GIF с JSON-файлов на PostgreSQL с pgvector. Хранить бинарные данные изображений/видео в БД (BYTEA). Векторный поиск по эмбеддингам на стороне БД вместо in-memory. Добавить Dockerfile для деплоя в k3s и docker-compose для локальной разработки.

## Контекст

Telegram мем-бот: пользователь описывает ситуацию, бот ищет подходящий мем или GIF через эмбеддинги + AI.

Текущее состояние: данные в JSON-файлах (`data/*.json`), загружаются в RAM при старте, cosine similarity in-memory, отправка по URL с Imgflip.

Масштаб: ~2300 мемов + ~6800 GIF, постепенный рост. Инфра: k3s + Flux, self-hosted registry.

## Схема БД

PostgreSQL 17 с расширением pgvector. Одна таблица:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE media (
  id          SERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  image_data  BYTEA,
  embedding   vector(384)
);

CREATE INDEX idx_media_type ON media(type);
```

- `external_id` — ID из Imgflip (slug для мемов, числовой ID для GIF). Используется для инкрементального обновления.
- `type` — `"meme"` или `"gif"`. Определяет способ отправки в Telegram и источник парсинга.
- `image_data` — бинарные данные (JPEG для мемов, MP4 для GIF). Скачиваются при парсинге.
- `embedding` — вектор 384 dimensions (модель `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`).

Для 10-15К записей pgvector brute-force поиск достаточно быстр (~5мс). IVFFlat индекс не нужен.

## Стек

- **Драйвер:** `pg` (node-postgres). Без ORM — одна таблица, простые запросы.
- **Подключение:** `pg.Pool` с `DATABASE_URL` из переменных окружения.
- **Docker-образ БД:** `pgvector/pgvector:pg17`.

## Конфигурация

Добавить в `src/config.ts`:

```typescript
db: {
  get connectionString(): string { return required("DATABASE_URL"); },
},
```

Убрать секцию `config.data` (пути к JSON-файлам больше не нужны).

`.env` дополняется:
```
DATABASE_URL=postgresql://memebot:memebot@localhost:5432/memebot
```

## Data pipeline

Скрипты по-прежнему параметризуются через `--type gif|meme`. Инкрементальность через SQL-условия.

### parse (парсинг + скачивание)

Парсит HTML с Imgflip, скачивает изображения/mp4 в бинарном виде, записывает в БД.

- Для каждой записи: `fetch(url)` → `Buffer` → `INSERT INTO media(external_id, type, name, image_data)`
- Пропускает записи с уже существующим `external_id` (`ON CONFLICT DO NOTHING` или предварительная проверка)
- Скрипт: `scripts/parse-imgflip.ts`

### enrich (описания)

Читает записи без описания, обогащает через Groq.

```sql
SELECT id, name FROM media WHERE type = $1 AND description IS NULL;
-- После обогащения:
UPDATE media SET description = $2 WHERE id = $1;
```

- Скрипт: `scripts/enrich-memes.ts`

### embed (эмбеддинги)

Читает записи с описанием, но без эмбеддинга, генерирует через HF API.

```sql
SELECT id, description FROM media WHERE type = $1 AND description IS NOT NULL AND embedding IS NULL;
-- После генерации:
UPDATE media SET embedding = $2 WHERE id = $1;
```

- Скрипт: `scripts/generate-embeddings.ts`

### migrate (миграции)

Новый скрипт `scripts/migrate.ts` — выполняет SQL-файлы из `migrations/`.

## Runtime (бот)

### Запуск

Бот не загружает данные в RAM. Инициализирует пул соединений к БД.

`src/index.ts`: убрать `loadMemes()`/`loadGifs()`, добавить проверку подключения к БД.

### Поиск

pgvector cosine distance вместо in-memory поиска:

```sql
SELECT id, name, description, image_data, type
FROM media
WHERE type = $1 AND embedding IS NOT NULL
ORDER BY embedding <=> $2
LIMIT 5;
```

`$1` — тип (`"meme"` или `"gif"`), `$2` — эмбеддинг запроса пользователя (от HF API).

### AI-выбор

Без изменений. Top-5 кандидатов из БД → Groq выбирает лучший → номер 1-5.

### Отправка

Бинарные данные из БД через grammY `InputFile`:

```typescript
import { InputFile } from "grammy";

// Мем
await ctx.replyWithPhoto(new InputFile(result.image_data, "meme.jpg"));
// GIF
await ctx.replyWithAnimation(new InputFile(result.image_data, "animation.mp4"));
```

### Хендлер

`pendingSituations` Map — без изменений (`{ text, embedding }` по chatId).

Вместо `findTopCandidates()` + `getAllMemes()`/`getAllGifs()` — SQL-запрос к БД.

## Что удаляется

- `src/services/meme.ts` — целиком (loadMemes, loadGifs, getAllMemes, getAllGifs, loadCollection)
- `cosineSimilarity()` и `findTopCandidates()` из `src/services/embedding.ts`
- `getDataPaths()` из `src/utils.ts`
- `config.data` из `src/config.ts`
- JSON-файлы: `data/memes.json`, `data/memes-indexed.json`, `data/gifs.json`, `data/gifs-indexed.json`
- `config.imgflip.apiUrl` и `scripts/fetch-memes.ts` (парсинг HTML заменяет API)

## Что добавляется

- `src/services/db.ts` — пул соединений, функции для работы с media
- `migrations/001-init.sql` — CREATE EXTENSION + CREATE TABLE
- `scripts/migrate.ts` — запуск миграций
- `docker-compose.yml` — PostgreSQL для локальной разработки
- `Dockerfile` — multi-stage сборка бота для продакшена
- `.dockerignore` — node_modules, data/, .env, .git

## Что остаётся без изменений

- `embedText()` в `src/services/embedding.ts` — эмбеддинг пользовательского запроса через HF API
- `selectMeme()` в `src/services/ai.ts` — AI-выбор из 5 кандидатов
- `pendingSituations` Map в хендлере
- `getContentType()` в утилитах — скрипты по-прежнему через `--type`
- Инлайн-клавиатура "Мем"/"GIF"

## Docker

### docker-compose.yml (локальная разработка)

Только БД. Бот запускается через `pnpm dev`.

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

### Dockerfile (продакшен)

Multi-stage: установка зависимостей → финальный образ с tsx и исходниками. Пушится в self-hosted registry, Flux деплоит в k3s.

### .dockerignore

```
node_modules
data/
.env
.git
.gitignore
docs/
```

## npm-скрипты

```json
"db:up": "docker compose up -d",
"db:down": "docker compose down",
"migrate": "tsx scripts/migrate.ts"
```

Существующие скрипты `parse-memes`, `enrich-memes`, `embed-memes`, `parse-gifs`, `enrich-gifs`, `embed-gifs` — сохраняются, но внутри работают с БД вместо JSON.

## Локальный workflow

```bash
pnpm db:up          # поднять PostgreSQL
pnpm migrate        # создать таблицу
pnpm parse-memes    # спарсить и скачать мемы в БД
pnpm enrich-memes   # обогатить описаниями
pnpm embed-memes    # сгенерировать эмбеддинги
pnpm parse-gifs     # то же для GIF
pnpm enrich-gifs
pnpm embed-gifs
pnpm dev            # запустить бота
```
