import { CheerioAPI } from "cheerio";
import { env, logger } from "./config";
export const getTotalPages = ($: CheerioAPI): number => {
  return Number(
    $(".in-pagination .in-pagination__list").children().last().text().trim()
  );
};

export const removeExtraHtml = ($: CheerioAPI): CheerioAPI => {
  $("style").remove();
  $("script").remove();
  return $;
};

export const getAllPromisesResults = async <T>(
  promises: Promise<T>[]
): Promise<T[]> => {
  const promiseResults = await Promise.allSettled(promises);
  return promiseResults
    .map((result) => {
      if (result.status === "rejected") {
        logger.error(`Error processing promise: ${result.reason}`);
        return null;
      }
      return result.value;
    })
    .filter((v) => v != null);
};

export const generateUrls = (
  cityData: { id: number; name: string },
  propertyType: string,
  purpose?: string
) => {
  const purposePart = purpose ? `${purpose}-` : "";
  return {
    cityId: cityData.id,
    url: `${env.BASE_URL}/${purposePart}${propertyType}/${cityData.name}/?criterio=data&ordine=desc&pag=*`,
  };
};
