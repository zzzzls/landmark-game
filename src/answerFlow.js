// Keep the two writes sequential. Only a confirmed user action starts this
// pipeline; restoring three saved guesses must never replay an uncertain submit.
export function hasAllAnswers(you) {
  return (
    you?.targets?.length === 3 &&
    you.targets.every((target) =>
      you.guesses?.some((guess) => guess.targetId === target.id),
    )
  );
}

export async function saveGuessAndSubmit(send, command, onSaved) {
  const saved = await send(command);
  onSaved(saved);
  if (
    saved.phase === "playing" &&
    !saved.you.submitted &&
    hasAllAnswers(saved.you)
  ) {
    return await send({ type: "submit" });
  }
  return saved;
}

export function bestResult(you) {
  if (!you?.submitted || !Number.isFinite(you.totalError)) return null;
  return (you.targets || [])
    .map((target) =>
      (you.results || []).find((result) => result.id === target.id),
    )
    .filter(
      (result) =>
        result && Number.isFinite(result.distance_m) && result.distance_m >= 0,
    )
    .reduce(
      (best, result) =>
        !best || result.distance_m < best.distance_m ? result : best,
      null,
    );
}
