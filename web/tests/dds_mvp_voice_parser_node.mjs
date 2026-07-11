#!/usr/bin/env node
/**
 * Unit tests for dds_mvp_voice.js speech-to-deal parser (no microphone).
 *
 * Usage: node dds_mvp_voice_parser_node.mjs [VOICE_JS_PATH]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultVoiceJs = path.resolve(__dirname, "..", "dds_mvp_voice.js");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadVoiceParser(voiceJsPath) {
  const src = fs.readFileSync(voiceJsPath, "utf8");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    PIPS: "AKQJT98765432",
    DIRECTIONS: ["north", "east", "south", "west"],
    SUITS: ["spades", "hearts", "diamonds", "clubs"],
  };
  runInNewContext(src, sandbox, { filename: voiceJsPath });
  const api = sandbox.module.exports;
  if (typeof api.parseSpokenDeal !== "function") {
    fail("parseSpokenDeal not exported from dds_mvp_voice.js");
  }
  if (typeof api.parsePbnToFields !== "function") {
    fail("parsePbnToFields not exported from dds_mvp_voice.js");
  }
  return api;
}

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    fail(`${label}: expected ${e}, got ${a}`);
  }
}

function assertIncludes(fields, key, value, label) {
  if (fields[key] !== value) {
    fail(`${label}: expected fields[${key}] === ${JSON.stringify(value)}, got ${JSON.stringify(fields[key])}`);
  }
}

function runTests(api) {
  let passed = 0;

  function test(name, fn) {
    try {
      fn();
      passed += 1;
    } catch (err) {
      fail(`FAIL ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  test("parseSpokenDeal maps direction suit and pip words", () => {
    const { fields, error } = api.parseSpokenDeal(
      "north spades ace king queen jack"
    );
    assertEqual(error, "", "error");
    assertIncludes(fields, "north_spades", "AKQJ", "north_spades");
  });

  test("parseSpokenDeal accepts compact pip letters", () => {
    const { fields, error } = api.parseSpokenDeal("east hearts AKQJT");
    assertEqual(error, "", "error");
    assertIncludes(fields, "east_hearts", "AKQJT", "east_hearts");
  });

  test("parseSpokenDeal accepts direction and suit abbreviations", () => {
    const { fields, error } = api.parseSpokenDeal("S clubs 9 8 7");
    assertEqual(error, "", "error");
    assertIncludes(fields, "south_clubs", "987", "south_clubs");
  });

  test("parseSpokenDeal accepts of-suit in-direction phrasing", () => {
    const { fields, error } = api.parseSpokenDeal(
      "ace king queen of spades in north"
    );
    assertEqual(error, "", "error");
    assertIncludes(fields, "north_spades", "AKQ", "north_spades");
  });

  test("parseSpokenDeal parses multiple holdings in one utterance", () => {
    const { fields, error } = api.parseSpokenDeal(
      "north spades ace queen eight five hearts ace king nine seven six"
    );
    assertEqual(error, "", "error");
    assertIncludes(fields, "north_spades", "AQ85", "north_spades");
    assertIncludes(fields, "north_hearts", "AK976", "north_hearts");
  });

  test("parsePbnToFields splits part-score test deal", () => {
    const pbn =
      "N:AQ85.AK976.5.J87 JT.QJ5432.Q9.KQ9 972..JT863.A6432 K643.T8.AK742.T5";
    const { fields, error } = api.parsePbnToFields(pbn);
    assertEqual(error, "", "error");
    assertIncludes(fields, "north_spades", "AQ85", "north_spades");
    assertIncludes(fields, "north_hearts", "AK976", "north_hearts");
    assertIncludes(fields, "north_diamonds", "5", "north_diamonds");
    assertIncludes(fields, "north_clubs", "J87", "north_clubs");
    assertIncludes(fields, "east_spades", "JT", "east_spades");
    assertIncludes(fields, "south_diamonds", "JT863", "south_diamonds");
    assertIncludes(fields, "west_clubs", "T5", "west_clubs");
  });

  test("parseSpokenDeal recognizes spoken PBN-style input", () => {
    const { fields, error } = api.parseSpokenDeal(
      "N colon AQ85 dot AK976 dot 5 dot J87"
    );
    assertEqual(error, "", "error");
    assertIncludes(fields, "north_spades", "AQ85", "north_spades");
    assertIncludes(fields, "north_hearts", "AK976", "north_hearts");
  });

  test("parseSpokenDeal rejects unknown pip words", () => {
    const { error } = api.parseSpokenDeal("north spades ace joker");
    if (!error) {
      fail("expected error for unknown pip word");
    }
  });

  test("parseSpokenDeal rejects empty transcript", () => {
    const { error } = api.parseSpokenDeal("   ");
    if (!error) {
      fail("expected error for empty transcript");
    }
  });

  console.log(`All ${passed} voice parser tests passed.`);
}

const voiceJs = process.argv[2] ?? defaultVoiceJs;
if (!fs.existsSync(voiceJs)) {
  fail(`voice JS not found: ${voiceJs}`);
}
runTests(loadVoiceParser(voiceJs));
