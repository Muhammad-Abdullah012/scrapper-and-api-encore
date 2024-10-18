import axios from "axios";
import { CheerioAPI, load } from "cheerio";
import { logger } from "./config";
import { IPage } from "./types/scrapper";
import { getAllPromisesResults, getTotalPages, removeExtraHtml } from "./utils";
import { prisma } from "./db-config";
import { bulkInsertUrls } from "./queries";

export const iterateAllPages = async (
  urls: IPage[],
  lastAddedUrlsMap: Record<number, string>
) => {
  for (const { url, cityId } of urls) {
    const lastPage = await fetchAndProcessPage(url, 1, cityId);
    if (lastPage == null) continue;
    console.log("lastPage => ", lastPage);
    const promises: Promise<number | null>[] = [];
    for (let i = 2; i <= lastPage; i++) {
      promises.push(fetchAndProcessPage(url, i, cityId));
    }
    await Promise.allSettled(promises);
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

export const scrapeHtmlPage = async (
  url: string,
  html: string = "",
  cityId: number | null
) => {
  if (!html.length) return;
  const $ = load(html);
  const title = $(".re-title__title").text();
  const description =
    $(".re-contentDescriptionHeading__title").text() +
    "\n" +
    $(".in-readAll").text();
  const mainFeatures = $(".re-mainFeatures__item")
    .map((i, el) => {
      return $(el).text().trim();
    })
    .get();
  const lastUpdatedDate = $(".re-lastUpdate__text")
    .text()
    .trim()
    .split(" ")
    .pop();
  const price = $(".re-overview__price");
  const isRange = price.hasClass("has-range");
  const priceText = $(".re-overview__price > span:first-child").text().trim();

  let price_min: number | null = null;
  let price_max: number | null = null;
  let price_unit: string = priceText[0];

  if (isRange) {
    const priceRange = priceText.split("-").map((p) => p.trim());
    const minPrice = priceRange[0]?.split(" ")?.pop();
    if (minPrice && !isNaN(Number(minPrice))) {
      price_min = Number(minPrice);
    }
    const maxPrice = priceRange[1]?.split(" ")?.pop();
    if (maxPrice && !isNaN(Number(maxPrice))) {
      price_max = Number(maxPrice);
    }
  } else {
    const minPrice = priceText.split(" ").pop();
    if (minPrice && !isNaN(Number(minPrice))) {
      price_min = Number(minPrice);
    }
  }

  return {
    url,
    title,
    price_min,
    price_max,
    price_unit,
    description,
    city_id: cityId,
    price_raw: priceText,
    main_features: mainFeatures,
    last_updated: lastUpdatedDate,
  };
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
