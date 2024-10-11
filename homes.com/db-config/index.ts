import { SQLDatabase } from "encore.dev/storage/sqldb";
import { PrismaClient } from "@prisma/client";

export const db = new SQLDatabase("test");

console.log("connection string => ", db.connectionString);

export const prisma = new PrismaClient({
  datasourceUrl: db.connectionString,
});
