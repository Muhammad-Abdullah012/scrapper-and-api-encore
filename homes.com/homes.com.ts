import { api } from "encore.dev/api";
import { generateUrls } from "./utils";
import { IPage } from "./types/scrapper";
import { prisma } from "./db-config";
import { env } from "./config";
import {
  iterateAllPages,
  processInBatches,
  scrapAndInsertData,
} from "./scrap.helper";

const { ITALIAN_CITIES_NAMES } = env;

interface Response {
  message: string;
}

export const ping = api(
  { expose: true, method: "GET", path: "/ping" },
  async (): Promise<Response> => {
    return { message: "homes.com service is running!" };
  }
);

export const scrapeHomes = api(
  { expose: true, method: "POST", path: "/scrapeHomes" },
  async (): Promise<Response> => {
    startScrapingHomesDotCom();
    return { message: "startScrapingHomesDotCom started!" };
  }
);

const startScrapingHomesDotCom = async () => {
  try {
    console.time("startScrapingHomesDotCom");
    console.log("startScrapingHomesDotCom started");

    await prisma.cities_encore.createMany({
      data: ITALIAN_CITIES_NAMES.split(",").map((city) => ({
        name: city,
      })),
      skipDuplicates: true,
    });

    const cities = await prisma.cities_encore.findMany({
      select: { id: true, name: true },
    });

    const PURPOSE = ["vendita", "affitto"];
    // property types common in buy and rent (vendita and affitto)
    const propertyTypes = [
      "case",
      "garage",
      "palazzi",
      "uffici",
      "negozi",
      "magazzini",
      "capannoni",
      "terreni",
    ];
    // property types specific for buy (vendita) and rent (affitto)
    const _propertyTypes = ["nuove-costruzioni", "affitto-stanze"]; // 1st buy, 2nd rent

    const urls: IPage[] = cities.flatMap((cityData) => {
      const _urls = _propertyTypes.flatMap((propertyType) =>
        generateUrls(cityData, propertyType)
      );
      const _urls2 = PURPOSE.flatMap((purpose) =>
        propertyTypes.flatMap((propertyType) =>
          generateUrls(cityData, propertyType, purpose)
        )
      );
      return [..._urls, ..._urls2];
    });
    console.log("urls => ", JSON.stringify(urls, null, 2));
    await iterateAllPages(urls, {});
    // fetch html for each urls and store it in db
    await processInBatches();
    // extract data from html and store it in db
    await scrapAndInsertData();
    // Done!
  } catch (err) {
    console.log(`Error occured => ${err}`);
  } finally {
    console.timeEnd("startScrapingHomesDotCom");
    console.log("startScrapingHomesDotCom ended");
  }
};
