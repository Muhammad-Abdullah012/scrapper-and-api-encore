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

export const validateEnvVariables = (requiredEnvVariables: string[]) => {
  const missingEnvVariables = requiredEnvVariables.filter(
    (key) => !process.env[key]
  );

  if (missingEnvVariables.length > 0) {
    throw new Error(
      `Missing environment variables: ${missingEnvVariables.join(", ")}`
    );
  }
};
