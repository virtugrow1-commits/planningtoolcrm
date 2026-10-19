import { assertEquals } from "jsr:@std/assert@1";
import { isValidBookingDate } from "./ghlCommon.ts";

Deno.test("isValidBookingDate accepts normal dates and rejects year typos", () => {
  assertEquals(isValidBookingDate("2026-06-23"), true);
  assertEquals(isValidBookingDate("0026-06-23"), false);
  assertEquals(isValidBookingDate("20266-06-23"), false);
  assertEquals(isValidBookingDate("2026-13-01"), false);
  assertEquals(isValidBookingDate(""), false);
  assertEquals(isValidBookingDate(null), false);
});
