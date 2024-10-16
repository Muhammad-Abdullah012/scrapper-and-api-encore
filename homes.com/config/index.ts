import { cleanEnv, str, url } from "envalid";
import Logger from "encore.dev/log";
import { config } from "dotenv";
config();

export const env = cleanEnv(process.env, {
  BASE_URL: url(),
  ITALIAN_CITIES_NAMES: str(),
});

export const logger = Logger;
