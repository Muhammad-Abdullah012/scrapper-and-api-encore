import { CheerioAPI } from "cheerio";
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
