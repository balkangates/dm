import { prepareDb } from "./prepare-db";

const url = process.argv[2] ?? process.env.VISUAL_DATABASE_URL;
if (!url) {
  console.error("Kullanım: prepare-db-cli <postgres-url>");
  process.exit(1);
}
prepareDb(url).then(
  () => console.log("[prepare-db] hazır"),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
