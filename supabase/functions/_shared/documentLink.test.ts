import { assertEquals } from "jsr:@std/assert@1";
import { isDocumentBeforeInquiry, pickInquiryForDocument } from "./documentLink.ts";

const inqs = [
  { id: 'oud', created_at: '2026-09-20T10:00:00Z' },
  { id: 'nieuw', created_at: '2026-10-26T21:00:00Z' },
];

Deno.test('document van 25-09 hoort bij de oude aanvraag, nooit bij de nieuwe', () => {
  assertEquals(pickInquiryForDocument(inqs, '2026-09-25T09:00:00Z')?.id, 'oud');
  assertEquals(pickInquiryForDocument(inqs.slice(1), '2026-09-25T09:00:00Z'), null);
});

Deno.test('nieuw document hoort bij de nieuwste aanvraag die al bestond', () => {
  assertEquals(pickInquiryForDocument(inqs, '2026-10-26T21:07:00Z')?.id, 'nieuw');
});

Deno.test('zonder documentdatum wordt niets gekoppeld', () => {
  assertEquals(pickInquiryForDocument(inqs, null), null);
});

Deno.test('isDocumentBeforeInquiry', () => {
  assertEquals(isDocumentBeforeInquiry('2026-09-25T09:00:00Z', '2026-10-26T21:00:00Z'), true);
  assertEquals(isDocumentBeforeInquiry('2026-10-26T21:07:00Z', '2026-10-26T21:00:00Z'), false);
  assertEquals(isDocumentBeforeInquiry(null, '2026-10-26T21:00:00Z'), false);
});
