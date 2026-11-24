export function userMessage(message: string): string {
  if (/level.*schema|schema.*invalid/i.test(message))
    return 'This game file could not be read. Try another game or return to the editor.';
  if (/checkpoint|DREAMCRAFT_CHECKPOINT|model weights/i.test(message))
    return 'Automatic generation is unavailable right now. Try a sample game, or use Advanced Edit to finish your drawing.';
  if (/CNN.*not confident|two possible labels|prediction changes|CNN could not check/i.test(message))
    return 'We could not identify this drawing clearly. Choose the matching symbol below.';
  if (/CNN scores do not guarantee|Python collision model is approximate/i.test(message))
    return '';
  if (/goal is above the highest possible/i.test(message))
    return 'The finish is too high to reach. Lower it or add another platform.';
  if (/No winning path.*search limit|No route.*sampled states/i.test(message))
    return 'We could not find a way to the finish within the time available. The level may still be playable.';
  if (/route was found in the Python simulation/i.test(message))
    return 'A possible way to the finish was found.';
  if (/gap between .* units/i.test(message))
    return 'There is a wide gap between platforms. Try adding a step or moving them closer together.';
  if (/platform .* units higher/i.test(message))
    return 'A platform may be too high to jump onto. Try lowering it or adding a step.';
  if (/spawn is not resting/i.test(message))
    return 'Place the start just above a platform so the player has somewhere to stand.';
  if (/Exactly one spawn/i.test(message)) return 'The drawing needs one S to mark the start.';
  if (/Exactly one goal/i.test(message)) return 'The drawing needs one G to mark the finish.';
  return message
    .replace(/\bCNN\b/g, 'automatic recognition')
    .replace(/\bPhaser\b/g, 'the game')
    .replace(/\bbackend(?:'s)?\b/gi, 'server')
    .replace(/\bcandidates\b/gi, 'objects')
    .replace(/\bcandidate\b/gi, 'object');
}

export function userNotes(messages: string[] = []): string[] {
  return [...new Set(messages.map(userMessage).filter(Boolean))];
}
