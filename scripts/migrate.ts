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
