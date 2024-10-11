import { api, Query } from "encore.dev/api";
import { prisma } from "../homes.com/db-config";

interface Response {
  data: string[];
  message: string;
  totalCount: number;
}
interface Request {
  limit?: Query<number>;
  page?: Query<number>;
}

export const getData = api(
  { expose: true, method: "GET", path: "/data" },
  async (request: Request): Promise<Response> => {
    const page = request.page || 1;
    const itemsPerPage = request.limit || 10;
    const offset = (page - 1) * itemsPerPage;

    // Fetch the paginated URLs
    const urls = await prisma.urls_encore.findMany({ select: { url: true } });
    const totalCount = urls.length;

    return {
      data: urls.map(({ url }) => url),
      message: "urls",
      totalCount,
    };
  }
);
