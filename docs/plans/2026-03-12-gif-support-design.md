# Поддержка GIF в Telegram мем-боте

## Контекст

Imgflip содержит ~6800 GIF-шаблонов (170 страниц по `/gif-templates?page=N`). HTML-структура идентична мемам. Фактический формат — MP4, не GIF.

**URL-паттерн:** превью `//i.imgflip.com/2/{id}.jpg` → видео `https://i.imgflip.com/{id}.mp4` (убрать `/2/`, заменить `.jpg` на `.mp4`).

## Данные

Новые файлы (аналогичны мемам):
- `data/gifs.json` — сырые данные после парсинга
- `data/gifs-indexed.json` — с описаниями и эмбеддингами

Тип `BaseMeme` не меняется (`id`, `name`, `url`). Для GIF поле `url` хранит mp4-ссылку.

## Конфиг

Добавить в `config.data`:
```typescript
data: {
  rawMemesPath: "data/memes.json",
  indexedMemesPath: "data/memes-indexed.json",
  rawGifsPath: "data/gifs.json",
  indexedGifsPath: "data/gifs-indexed.json",
}
```

Добавить в `config.imgflip`:
```typescript
imgflip: {
  apiUrl: "https://api.imgflip.com/get_memes",
  templatesUrl: "https://imgflip.com/memetemplates",
  gifTemplatesUrl: "https://imgflip.com/gif-templates",
}
```

## Скрипты — переиспользование

Все три скрипта параметризуются через `--type gif|meme` (по умолчанию `meme`):

### parse-imgflip-memes.ts
- `--type meme`: парсит `/memetemplates`, сохраняет в `data/memes.json`
- `--type gif`: парсит `/gif-templates`, трансформирует URL превью в mp4, сохраняет в `data/gifs.json`

### enrich-memes.ts
- `--type meme`: читает `memes.json`, пишет в `memes-indexed.json`
- `--type gif`: читает `gifs.json`, пишет в `gifs-indexed.json`

### generate-embeddings.ts
- `--type meme`: работает с `memes-indexed.json`
- `--type gif`: работает с `gifs-indexed.json`

npm-скрипты:
```json
"parse-gifs": "tsx scripts/parse-imgflip-memes.ts --type gif",
"enrich-gifs": "tsx scripts/enrich-memes.ts --type gif",
"embed-gifs": "tsx scripts/generate-embeddings.ts --type gif"
```

## Логика бота

### Новый UX-флоу:
1. Пользователь отправляет текст (описание ситуации)
2. Бот сразу вычисляет эмбеддинг ситуации
3. Бот отвечает инлайн-клавиатурой: кнопки "Мем" и "GIF"
4. Пользователь нажимает кнопку
5. Бот ищет по соответствующей базе (мемы или GIF), вызывает AI для финального выбора
6. Отправляет результат: `replyWithPhoto` для мемов, `replyWithAnimation` для GIF

### Состояние
- `Map<number, { text: string; embedding: number[] }>` — хранит ситуацию и эмбеддинг по `chatId`
- Новое сообщение перезаписывает предыдущую ситуацию

### Загрузка данных
- `src/services/meme.ts`: добавить `loadGifs()` и `getAllGifs()` (или обобщить через параметр)
- `src/index.ts`: загружать обе базы при старте

### Отправка
- Мем: `ctx.replyWithPhoto(meme.url)`
- GIF: `ctx.replyWithAnimation(gif.url)` (Telegram принимает mp4 через sendAnimation)
