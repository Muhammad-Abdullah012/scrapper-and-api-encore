import { prisma } from "./db-config";

export const bulkInsertUrls = async (
  urls: { url: string; city_id: number }[]
) => {
  try {
    await prisma.urls_encore.createMany({ data: urls, skipDuplicates: true });
    console.log("Bulk insert successful");
  } catch (error) {
    console.error("Error during bulk insert:", error);
  }
};
