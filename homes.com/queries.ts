import { URLS_TABLE_NAME } from "./constants";
import { db } from "./db-config";

export const bulkInsertUrls = async (urls: { url: string }[]) => {
  const values = urls.map((user) => `('${user.url}')`).join(", ");
  const query = `INSERT INTO ${URLS_TABLE_NAME} (url) VALUES ${values} ON CONFLICT DO NOTHING;`;

  try {
    await db.exec(query as unknown as TemplateStringsArray);
    console.log("Bulk insert successful");
  } catch (error) {
    console.error("Error during bulk insert:", error);
  }
};
