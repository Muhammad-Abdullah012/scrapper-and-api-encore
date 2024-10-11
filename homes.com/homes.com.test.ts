import { describe, expect, test } from "vitest";
import { ping } from "./homes.com";

describe("get", () => {
  test("should get ping response!", async () => {
    const resp = await ping();
    expect(resp.message).toBe("homes.com service is running!");
  });
});
