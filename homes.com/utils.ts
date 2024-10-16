import { CheerioAPI } from "cheerio";
import { env } from "./config";
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
