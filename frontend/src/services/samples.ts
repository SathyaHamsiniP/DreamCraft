import trail from "../../../contracts/examples/sky-trail.json";
import flat from "../../../contracts/examples/flat.json";
import coins from "../../../contracts/examples/coins.json";
import jump from "../../../contracts/examples/one-jump.json";
import { parseLevel } from "../../../game/src/contracts";
export const samples = [
  {
    category: "Playable demos",
    id: "trail",
    name: "Sky trail · jump and collect",
    description:
      "Cross the gap, jump over barriers, and reach the portal. Coins are optional bonuses.",
    level: trail,
  },
  {
    category: "Playable demos",
    id: "flat",
    name: "Walking practice · no obstacles",
    description: "A clear path to your first finish.",
    level: flat,
  },
  {
    category: "Playable demos",
    id: "coins",
    name: "Coin trail",
    description: "Collect a few coins along the way.",
    level: coins,
  },
  {
    category: "Playable demos",
    id: "jump",
    name: "One small jump",
    description: "Try a jump between platforms.",
    level: jump,
  },
];
export function sampleLevel(id: string) {
  const sample = samples.find((s) => s.id === id);
  if (!sample) throw new Error("Sample level not found");
  return parseLevel(sample.level);
}
