import axios from "axios";
import * as cheerio from "cheerio";
import { api } from "encore.dev/api";
import { getTotalPages, removeExtraHtml } from "./utils";
import { bulkInsertUrls } from "./queries";

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
    const cities = [{ name: "milano" }];

    await iterateAllPages(
      [
        "https://www.immobiliare.it/vendita-case/milano/?criterio=data&ordine=desc&pag=*",
      ],
      {}
    );
  } catch (err) {
    console.log(`Error occured => ${err}`);
  } finally {
    console.timeEnd("startScrapingHomesDotCom");
    console.log("startScrapingHomesDotCom ended");
  }
};

const iterateAllPages = async (
  urls: string[],
  lastAddedUrlsMap: Record<number, string>
) => {
  for (const url of urls) {
    const lastPage = await fetchAndProcessPage(url, 1);
    if (lastPage == null) continue;
    console.log("lastPage => ", lastPage);
    for (let i = 2; i <= lastPage; i++) {
      await fetchAndProcessPage(url, i);
    }
  }
};

const fetchAndProcessPage = async (url: string, page: number) => {
  try {
    const pageUrl = url.replace("*", page.toString());
    console.log("fetching page => ", pageUrl);
    const response = await axios.get(pageUrl);
    const $ = removeExtraHtml(cheerio.load(response.data));
    await processPage($);
    return page === 1 ? getTotalPages($) : null;
  } catch (err) {
    console.log(`Error occured => ${err}`);
    return null;
  }
};

const processPage = ($: cheerio.CheerioAPI): Promise<void> => {
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
    .map((link) => ({ url: link }));
  return bulkInsertUrls(links);
};
