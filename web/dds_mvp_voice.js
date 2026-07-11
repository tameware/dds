// Copyright 2020-2026 Adam Wildavsky
//
//   Use of this source code is governed by an MIT-style
//   license that can be found in the LICENSE file or at
//   https://opensource.org/licenses/MIT

/* eslint-env es6 */
/* exported toggleVoiceInput pageLoadVoice */

"use strict";

const VOICE_PIPS = typeof PIPS !== "undefined" ? PIPS : "AKQJT98765432";
const VOICE_DIRECTIONS = typeof DIRECTIONS !== "undefined"
    ? DIRECTIONS
    : ["north", "east", "south", "west"];
const VOICE_SUITS = typeof SUITS !== "undefined"
    ? SUITS
    : ["spades", "hearts", "diamonds", "clubs"];

const DIRECTION_ALIASES = {
    "n": "north",
    "north": "north",
    "e": "east",
    "east": "east",
    "s": "south",
    "south": "south",
    "w": "west",
    "west": "west"
};

const SUIT_ALIASES = {
    "s": "spades",
    "spade": "spades",
    "spades": "spades",
    "h": "hearts",
    "heart": "hearts",
    "hearts": "hearts",
    "d": "diamonds",
    "diamond": "diamonds",
    "diamonds": "diamonds",
    "c": "clubs",
    "club": "clubs",
    "clubs": "clubs"
};

const PIP_WORDS = {
    "ace": "A",
    "a": "A",
    "king": "K",
    "k": "K",
    "queen": "Q",
    "q": "Q",
    "jack": "J",
    "j": "J",
    "ten": "T",
    "t": "T",
    "nine": "9",
    "eight": "8",
    "seven": "7",
    "six": "6",
    "five": "5",
    "four": "4",
    "three": "3",
    "two": "2"
};

const DIRECTION_LETTER = {
    "north": "N",
    "east": "E",
    "south": "S",
    "west": "W"
};

const SUIT_LETTER = {
    "spades": "S",
    "hearts": "H",
    "diamonds": "D",
    "clubs": "C"
};

let voiceRecognition = null;
let voiceListening = false;

function sortHolding(holding) {
    return holding
        .split("")
        .sort((a, b) => VOICE_PIPS.indexOf(a) - VOICE_PIPS.indexOf(b))
        .join("");
}

function mergeHolding(existing, addition) {
    const merged = new Set((existing + addition).split(""));
    return sortHolding([...merged].join(""));
}

function fieldId(direction, suit) {
    return direction + "_" + suit;
}

function normalizeTranscript(transcript) {
    return transcript
        .trim()
        .toLowerCase()
        .replace(/[,;!?]/g, " ")
        .replace(/\s+/g, " ");
}

function tokenizeTranscript(transcript) {
    const normalized = normalizeTranscript(transcript);
    if (!normalized.length) {
        return [];
    }
    return normalized.split(" ");
}

function parsePipToken(token) {
    if (PIP_WORDS[token]) {
        return PIP_WORDS[token];
    }

    const upper = token.toUpperCase();
    if (upper.length === 1 && VOICE_PIPS.includes(upper)) {
        return upper;
    }

    return null;
}

function looksLikePbn(transcript) {
    const normalized = normalizeTranscript(transcript);
    return /(?:^|\s)n\s*:\s*/.test(normalized)
        || /(?:^|\s)north\s+colon\s+/.test(normalized)
        || /\b(?:n|north)\s+colon\b/.test(normalized);
}

function normalizePbnText(transcript) {
    let text = normalizeTranscript(transcript);
    text = text.replace(/\bnorth\s+colon\s+/g, "n:");
    text = text.replace(/\beast\s+colon\s+/g, "e:");
    text = text.replace(/\bsouth\s+colon\s+/g, "s:");
    text = text.replace(/\bwest\s+colon\s+/g, "w:");
    text = text.replace(/\b([nesw])\s+colon\s+/g, "$1:");
    text = text.replace(/\bdot\b/g, ".");
    text = text.replace(/\s*\.\s*/g, ".");
    text = text.replace(/\s+/g, " ");
    return text.trim().toUpperCase();
}

function emptyFieldMap() {
    const fields = {};
    for (const direction of VOICE_DIRECTIONS) {
        for (const suit of VOICE_SUITS) {
            fields[fieldId(direction, suit)] = "";
        }
    }
    return fields;
}

function applyHandChunkToFields(fields, direction, handChunk) {
    const suits = handChunk.split(".");
    if (suits.length !== 4) {
        return "Each hand must have four suits separated by dots.";
    }

    for (let suitIndex = 0; suitIndex < suits.length; suitIndex += 1) {
        const suit = VOICE_SUITS[suitIndex];
        const holding = suits[suitIndex].toUpperCase();

        for (const pip of holding) {
            if (!VOICE_PIPS.includes(pip)) {
                return "Please use only these pips: " + VOICE_PIPS;
            }
        }

        fields[fieldId(direction, suit)] = sortHolding(holding);
    }

    return "";
}

function parsePbnToFields(pbn) {
    const fields = emptyFieldMap();

    let text = pbn.trim();
    if (!text.length) {
        return { fields, error: "Please speak a deal or PBN string." };
    }

    const directionPrefix = text.match(/^([NESW]):\s*/i);
    let startDirection = "north";
    if (directionPrefix) {
        startDirection = DIRECTION_ALIASES[directionPrefix[1].toLowerCase()];
        text = text.replace(/^([NESW]):\s*/i, "");
    } else if (!/^N:/i.test(text)) {
        text = text.replace(/^N:\s*/i, "");
    } else {
        text = text.replace(/^N:\s*/i, "");
    }

    const handChunks = text.split(/\s+/).filter((chunk) => chunk.length);
    if (!handChunks.length) {
        return { fields, error: "PBN hand is empty." };
    }

    if (handChunks.length > 4) {
        return { fields, error: "PBN must contain at most four hands." };
    }

    const handOrder = ["north", "east", "south", "west"];
    const startIndex = handOrder.indexOf(startDirection);
    if (startIndex < 0) {
        return { fields, error: "Unknown direction in PBN." };
    }

    for (let chunkIndex = 0; chunkIndex < handChunks.length; chunkIndex += 1) {
        const direction = handOrder[startIndex + chunkIndex];
        if (!direction) {
            return { fields, error: "PBN must contain at most four hands." };
        }
        const chunkError = applyHandChunkToFields(
            fields,
            direction,
            handChunks[chunkIndex]
        );
        if (chunkError) {
            return { fields, error: chunkError };
        }
    }

    return { fields, error: "" };
}

function parseSpokenTokens(tokens) {
    const fields = emptyFieldMap();
    const invalidTokens = [];
    const pendingPips = [];

    let currentDirection = null;
    let currentSuit = null;

    function flushPendingPips() {
        if (!currentDirection || !currentSuit || !pendingPips.length) {
            return;
        }
        const id = fieldId(currentDirection, currentSuit);
        for (const pip of pendingPips) {
            fields[id] = mergeHolding(fields[id], pip);
        }
        pendingPips.length = 0;
    }

    function addPip(pip) {
        if (!currentDirection || !currentSuit) {
            pendingPips.push(pip);
            return;
        }
        const id = fieldId(currentDirection, currentSuit);
        fields[id] = mergeHolding(fields[id], pip);
    }

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];

        if (token === "in" || token === "of") {
            continue;
        }

        if (DIRECTION_ALIASES[token]) {
            currentDirection = DIRECTION_ALIASES[token];
            flushPendingPips();
            continue;
        }

        if (SUIT_ALIASES[token]) {
            currentSuit = SUIT_ALIASES[token];
            flushPendingPips();
            continue;
        }

        const pip = parsePipToken(token);
        if (pip) {
            addPip(pip);
            continue;
        }

        if (/^[akqjt98765432]+$/i.test(token)) {
            for (const letter of token.toUpperCase()) {
                addPip(letter);
            }
            continue;
        }

        invalidTokens.push(token);
    }

    flushPendingPips();

    if (invalidTokens.length) {
        const unknown = invalidTokens
            .filter((value) => !parsePipToken(value))
            .join(", ");
        if (unknown.length) {
            return {
                fields,
                error: "Unrecognized speech: " + unknown
            };
        }
    }

    if (pendingPips.length) {
        return {
            fields,
            error: "No cards recognized. Try e.g. \"north spades ace king queen\"."
        };
    }

    const hasCards = Object.values(fields).some((holding) => holding.length > 0);
    if (!hasCards) {
        return {
            fields,
            error: "No cards recognized. Try e.g. \"north spades ace king queen\"."
        };
    }

    return { fields, error: "" };
}

function parseSpokenDeal(transcript) {
    if (!transcript || !transcript.trim().length) {
        return {
            fields: {},
            error: "No speech heard."
        };
    }

    if (looksLikePbn(transcript)) {
        return parsePbnToFields(normalizePbnText(transcript));
    }

    const tokens = tokenizeTranscript(transcript);
    if (!tokens.length) {
        return {
            fields: {},
            error: "No speech heard."
        };
    }

    return parseSpokenTokens(tokens);
}

function applyParsedDealToForm(parsed, options) {
    const opts = options || {};
    const replace = opts.replace !== false;

    for (const [id, holding] of Object.entries(parsed.fields)) {
        const element = document.getElementById(id);
        if (!element) {
            continue;
        }

        if (replace || !element.value.length) {
            element.value = holding;
        } else if (holding.length) {
            element.value = mergeHolding(element.value, holding);
        }
    }
}

function setVoiceStatus(message, isError) {
    const status = document.getElementById("voice-status");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.classList.toggle("voice-status-error", Boolean(isError));
}

function setVoiceButtonState(listening) {
    const button = document.getElementById("voice-input-button");
    if (!button) {
        return;
    }
    button.classList.toggle("voice-listening", listening);
    button.setAttribute("aria-pressed", listening ? "true" : "false");
    button.textContent = listening ? "Stop voice input" : "Voice input";
}

function speechRecognitionSupported() {
    return Boolean(
        typeof window !== "undefined"
        && (window.SpeechRecognition || window.webkitSpeechRecognition)
    );
}

function stopVoiceInput() {
    if (voiceRecognition) {
        voiceRecognition.stop();
    }
    voiceListening = false;
    setVoiceButtonState(false);
}

function handleVoiceTranscript(transcript) {
    const parsed = parseSpokenDeal(transcript);

    if (parsed.error) {
        setVoiceStatus(parsed.error, true);
        const result = document.getElementById("result");
        if (result) {
            result.innerHTML = parsed.error;
        }
        return;
    }

    applyParsedDealToForm(parsed, { replace: true });
    clear_results();
    setVoiceStatus("Deal updated from voice.", false);
}

function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition
        || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        setVoiceStatus(
            "Voice input is not supported in this browser.",
            true
        );
        return;
    }

    if (!voiceRecognition) {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.lang = "en-US";
        voiceRecognition.interimResults = false;
        voiceRecognition.continuous = false;
        voiceRecognition.maxAlternatives = 1;

        voiceRecognition.onstart = function onVoiceStart() {
            voiceListening = true;
            setVoiceButtonState(true);
            setVoiceStatus("Listening…", false);
        };

        voiceRecognition.onresult = function onVoiceResult(event) {
            const transcript = event.results[0][0].transcript;
            handleVoiceTranscript(transcript);
        };

        voiceRecognition.onerror = function onVoiceError(event) {
            voiceListening = false;
            setVoiceButtonState(false);
            const message = event.error === "not-allowed"
                ? "Microphone access denied."
                : "Voice input error: " + event.error;
            setVoiceStatus(message, true);
        };

        voiceRecognition.onend = function onVoiceEnd() {
            voiceListening = false;
            setVoiceButtonState(false);
            if (!document.getElementById("voice-status").textContent.length) {
                setVoiceStatus("Voice input stopped.", false);
            }
        };
    }

    try {
        voiceRecognition.start();
    } catch (err) {
        setVoiceStatus(
            err instanceof Error ? err.message : String(err),
            true
        );
    }
}

function toggleVoiceInput() {
    if (voiceListening) {
        stopVoiceInput();
        setVoiceStatus("Voice input stopped.", false);
        return;
    }
    startVoiceInput();
}

function pageLoadVoice() {
    if (!speechRecognitionSupported()) {
        setVoiceStatus(
            "Voice input unavailable (browser lacks speech recognition).",
            false
        );
        const button = document.getElementById("voice-input-button");
        if (button) {
            button.disabled = true;
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseSpokenDeal,
        parsePbnToFields,
        sortHolding,
        mergeHolding,
        normalizeTranscript,
        tokenizeTranscript
    };
}
