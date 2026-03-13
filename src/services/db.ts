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
