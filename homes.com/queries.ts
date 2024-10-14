import { prisma } from "./db-config";

export const bulkInsertUrls = async (urls: { url: string }[]) => {
  try {
    await prisma.urls_encore.createMany({ data: urls, skipDuplicates: true });
    console.log("Bulk insert successful");
  } catch (error) {
    console.error("Error during bulk insert:", error);
  }
};
