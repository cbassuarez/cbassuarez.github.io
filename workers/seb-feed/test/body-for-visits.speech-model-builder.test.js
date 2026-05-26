import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildModelFromTexts,
  stripGutenberg,
  tokenizeText,
} from "../../../scripts/build-corpus-speech-model.mjs";

test("stripGutenberg removes standard header and footer", () => {
  const raw = [
    "license header",
    "*** START OF THE PROJECT GUTENBERG EBOOK TEST BOOK ***",
    "This is the body.",
    "*** END OF THE PROJECT GUTENBERG EBOOK TEST BOOK ***",
    "license footer",
  ].join("\n");
  assert.equal(stripGutenberg(raw).trim(), "This is the body.");
});

test("tokenizeText normalizes punctuation and removes blocked source terms", () => {
  assert.deepEqual(
    tokenizeText("Tristram said--well, the room thinks; then it ends."),
    ["said", "—", "well", ",", "the", "room", "thinks", ";", "then", "it", "ends", "."]
  );
});

test("buildModelFromTexts is deterministic and filters blocked names", () => {
  const repeated = Array.from(
    { length: 10 },
    () => "At first the room remembers, and then the room keeps talking; still the room remembers."
  ).join("\n");
  const text = [
    "*** START OF THE PROJECT GUTENBERG EBOOK TEST BOOK ***",
    repeated,
    "Ahab and Tristram should not survive the model.",
    "*** END OF THE PROJECT GUTENBERG EBOOK TEST BOOK ***",
  ].join("\n");
  const sources = [{ id: "test", title: "Test", author: "Tester", url: "https://example.test/book.txt" }];
  const a = buildModelFromTexts([text], sources);
  const b = buildModelFromTexts([text], sources);

  assert.deepEqual(a, b);
  assert.ok(a.starts.length > 0);
  assert.ok(a.grams["1"].length > 0);
  const serialized = JSON.stringify({ starts: a.starts, grams: a.grams });
  assert.ok(!/\bahab\b/.test(serialized));
  assert.ok(!/\btristram\b/.test(serialized));
});
