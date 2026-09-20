import test from "node:test";
import assert from "node:assert/strict";
import {
  hasAllAnswers,
  bestResult,
  saveGuessAndSubmit,
} from "../src/answerFlow.js";
const targets = ["a", "b", "c"].map((id) => ({ id }));
const state = (n) => ({
  phase: "playing",
  you: {
    targets,
    guesses: targets.slice(0, n).map((t) => ({ targetId: t.id })),
    submitted: false,
  },
});
test("third confirmed guess submits sequentially once, after the saved callback", async () => {
  const calls = [];
  const send = async (message) => {
    calls.push(message.type);
    return message.type === "guess"
      ? state(3)
      : { ...state(3), you: { ...state(3).you, submitted: true } };
  };
  const result = await saveGuessAndSubmit(send, { type: "guess" }, () =>
    calls.push("saved"),
  );
  assert.deepEqual(calls, ["guess", "saved", "submit"]);
  assert.equal(result.you.submitted, true);
});
test("incomplete or revealed state never submits; duplicate/foreign guesses are not completion", async () => {
  for (const next of [state(2), { ...state(3), phase: "reveal" }]) {
    const calls = [];
    await saveGuessAndSubmit(
      async (message) => {
        calls.push(message.type);
        return next;
      },
      { type: "guess" },
      () => {},
    );
    assert.deepEqual(calls, ["guess"]);
  }
  assert.equal(
    hasAllAnswers({
      targets,
      guesses: [{ targetId: "a" }, { targetId: "a" }, { targetId: "x" }],
    }),
    false,
  );
});
test("failed guess preserves preview callback; failed submit retains saved state and does not retry", async () => {
  let saved = false,
    calls = 0;
  await assert.rejects(
    saveGuessAndSubmit(
      async () => {
        throw Error("rejected");
      },
      { type: "guess" },
      () => {
        saved = true;
      },
    ),
  );
  assert.equal(saved, false);
  await assert.rejects(
    saveGuessAndSubmit(
      async (message) => {
        calls++;
        if (message.type === "submit") throw Error("disconnected");
        return state(3);
      },
      { type: "guess" },
      () => {
        saved = true;
      },
    ),
  );
  assert.equal(saved, true);
  assert.equal(calls, 2);
});
test("best result uses server meters, preserves target order on ties and accepts exact zero", () => {
  const you = {
    targets,
    submitted: true,
    totalError: 20,
    results: [
      { id: "c", distance_m: 10 },
      { id: "b", distance_m: 5 },
      { id: "a", distance_m: 5 },
    ],
  };
  assert.equal(bestResult(you).id, "a");
  you.results[0].distance_m = 0;
  assert.equal(bestResult(you).id, "c");
  assert.equal(bestResult({ ...you, submitted: false }), null);
  assert.equal(bestResult({ ...you, totalError: null }), null);
  assert.equal(
    bestResult({
      ...you,
      results: [
        { id: "a", distance_m: NaN },
        { id: "b", distance_m: null },
      ],
    }),
    null,
  );
});
