import axios from "axios";
import { api } from "encore.dev/api";
import { load, CheerioAPI } from "cheerio";
import { generateUrls, getTotalPages, removeExtraHtml } from "./utils";
import { bulkInsertUrls } from "./queries";
import { IPage } from "./types/scrapper";
import { prisma } from "./db-config";
import { env, logger } from "./config";

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

const iterateAllPages = async (
  urls: IPage[],
  lastAddedUrlsMap: Record<number, string>
) => {
  for (const { url, cityId } of urls) {
    const lastPage = await fetchAndProcessPage(url, 1, cityId);
    if (lastPage == null) continue;
    console.log("lastPage => ", lastPage);
    for (let i = 2; i <= lastPage; i++) {
      await fetchAndProcessPage(url, i, cityId);
    }
  }
};

const fetchAndProcessPage = async (
  url: string,
  page: number,
  cityId: number
) => {
  try {
    const pageUrl = url.replace("*", page.toString());
    console.log("fetching page => ", pageUrl);
    const response = await axios.get(pageUrl);
    const $ = removeExtraHtml(load(response.data));
    await processPage($, cityId);
    return page === 1 ? getTotalPages($) : null;
  } catch (err) {
    console.log(`Error occured => ${err}`);
    return null;
  }
};

const processPage = ($: CheerioAPI, cityId: number): Promise<void> => {
  const listings = $("ul.ls-results").find("li.in-searchLayoutListItem");
  if (listings.length === 0) {
    console.log("No listings found on this page");
    return Promise.resolve();
  }
  console.log(`${listings.length} listings found`);
  const links = listings
    .map((_, element) => {
      const li = $(element);
      return li.find("a.in-listingCardTitle").attr("href");
    })
    .get()
    .filter((link) => link != null)
    .map((link) => ({ url: link, city_id: cityId }));
  return bulkInsertUrls(links);
};

export const processInBatches = async () => {
  const finishedProcessingMessage = "No more records to process.";
  const batchSize = 50;

  while (true) {
    try {
      await prisma.$transaction(
        async (transaction) => {
          const batch = await transaction.urls_encore.findMany({
            where: { is_processed: false },
            select: { url: true, city_id: true },
            take: batchSize,
          });

          if (batch.length === 0) {
            throw new Error(finishedProcessingMessage);
          }
          const dataToInsert = await getAllPromisesResults(
            batch.map((page) =>
              getHtmlPage({ url: page.url, cityId: page.city_id ?? 0 })
            )
          );
          const filteredDataToInsert = dataToInsert.filter((v) => v != null);

          logger.info(`dataToInsert length => ${dataToInsert.length}`);

          if (dataToInsert.length === 0)
            throw new Error(finishedProcessingMessage);

          logger.info("Running raw_properties bulk create query");
          await transaction.raw_encore.createMany({
            data: filteredDataToInsert,
            skipDuplicates: true,
          });

          const insertedUrls = await transaction.raw_encore.findMany({
            where: {
              url: {
                in: filteredDataToInsert.map((item) => item.url),
              },
            },
            select: {
              url: true,
            },
          });
          logger.info("Running url update query");
          await transaction.urls_encore.updateMany({
            data: { is_processed: true },
            where: { url: { in: insertedUrls.map((d) => d.url) } },
          });
        },
        { timeout: 200000 }
      );
    } catch (err) {
      logger.error(`Error processing batch: ${err}`);
      if (err instanceof Error && err.message === finishedProcessingMessage) {
        break;
      }
    }
  }
};

export const scrapAndInsertData = async () => {
  const finishedProcessingMessage = "No more records to process.";
  const pageSize = 50;

  while (true) {
    try {
      await prisma.$transaction(
        async (transaction) => {
          const rawData = await transaction.raw_encore.findMany({
            where: {
              is_processed: false,
            },
            select: { url: true, html: true, city_id: true },
            take: pageSize,
          });

          if (rawData.length === 0) {
            throw new Error(finishedProcessingMessage);
          }

          const dataToInsert = await getAllPromisesResults(
            rawData.map(({ url, html, city_id }) =>
              scrapeHtmlPage(url, html, city_id)
            )
          );
          const filteredDataToInsert = dataToInsert.filter((v) => v != null);
          logger.info(`dataToInsert length => ${filteredDataToInsert.length}`);

          if (filteredDataToInsert.length === 0)
            throw new Error(finishedProcessingMessage);

          logger.info("Running property bulk create query");
          await transaction.properties_encore.createMany({
            data: filteredDataToInsert,
            skipDuplicates: true,
          });
          const insertedUrls = await transaction.properties_encore.findMany({
            where: {
              url: {
                in: filteredDataToInsert.map((item) => item.url),
              },
            },
            select: {
              url: true,
            },
          });
          logger.info("Running raw_properties update query");
          await transaction.raw_encore.updateMany({
            data: { is_processed: true },
            where: {
              url: {
                in: insertedUrls.map((d) => d?.url),
              },
            },
          });
        },
        { timeout: 200000 }
      );
    } catch (err) {
      if (err instanceof Error && err.message === finishedProcessingMessage)
        break;
      logger.error("scrapAndInsertData::Error inserting data: ", err);
    }
  }
};

export const getHtmlPage = async (page: IPage) => {
  try {
    logger.info(`getting html at: ${page.url}`);
    const result = await axios.get(page.url);
    const $ = removeExtraHtml(load(result.data));
    $("link").remove();
    $("meta").remove();
    $("svg").remove();
    $("br").replaceWith("\n");
    return {
      url: page.url,
      city_id: page.cityId,
      html: $.html(),
    };
  } catch (error) {
    logger.error(`getHtmlPage::Error scraping ${page.url}: ${error}`);
    return null;
  }
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

export const scrapeHtmlPage = async (
  url: string,
  html: string = "",
  cityId: number | null
) => {
  if (!html.length) return;
  const $ = load(html);
  const title = $(".re-title__title").text();
  return { url, title, city_id: cityId };
};
