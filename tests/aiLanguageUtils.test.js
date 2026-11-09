import assert from "node:assert/strict";
import test from "node:test";
import {
  detectLanguageCode,
  resolveContentLanguageCode,
} from "../utils/aiLanguageUtils.js";

test("detects the language of quiz questions and feedback", () => {
  assert.equal(detectLanguageCode("What is the Columbian Exchange?"), "en");
  assert.equal(
    detectLanguageCode("Correct. You named one of the ships."),
    "en",
  );
  assert.equal(detectLanguageCode("¿Qué es el intercambio colombino?"), "es");
  assert.equal(
    detectLanguageCode(
      "Bien. Mencionas el intercambio de plantas y animales, pero faltan otros elementos importantes como enfermedades y personas.",
    ),
    "es",
  );
  assert.equal(detectLanguageCode("ما هو التبادل الكولومبي؟"), "ar");
  assert.equal(detectLanguageCode("یہ کیا ہے؟"), "ur");
  assert.equal(detectLanguageCode("Quelle est la réponse correcte ?"), "fr");
  assert.equal(detectLanguageCode("Qual é a resposta correta?"), "pt");
  assert.equal(detectLanguageCode("Kolombiya takası nedir?"), "tr");
});

test("short or ambiguous text is not called", () => {
  assert.equal(detectLanguageCode(""), null);
  assert.equal(detectLanguageCode("2 + 2"), null);
  assert.equal(detectLanguageCode("Bien."), null);
});

test("the question text decides the language, not its reference", () => {
  assert.equal(
    resolveContentLanguageCode({
      question: "What is the Columbian Exchange?",
      modelAnswer: "Bien. El intercambio de plantas y animales.",
      rubric: "Se debe mencionar el intercambio entre mundos.",
    }),
    "en",
  );
  assert.equal(
    resolveContentLanguageCode({
      question: "¿Qué es el intercambio colombino?",
      modelAnswer: "The movement of plants and animals.",
    }),
    "es",
  );
  assert.equal(resolveContentLanguageCode({ question: "2 + 2" }), "en");
});
