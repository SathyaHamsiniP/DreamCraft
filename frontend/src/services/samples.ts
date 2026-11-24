import trail from "../../../contracts/examples/sky-trail.json";
import flat from "../../../contracts/examples/flat.json";
import coins from "../../../contracts/examples/coins.json";
import jump from "../../../contracts/examples/one-jump.json";
import gap from "../../../contracts/examples/wide-gap.json";
import high from "../../../contracts/examples/high-goal.json";
import { parseLevel } from "../../../game/src/contracts";
export const samples = [
  {
    id: "trail",
    name: "Sky trail · jump and collect",
    description:
      "Cross the gap, jump over spikes, and reach the flag. Coins are optional bonuses.",
    level: trail,
  },
  {
    id: "flat",
    name: "Walking practice · no obstacles",
    description: "A clear path to your first finish.",
    level: flat,
  },
  {
    id: "coins",
    name: "Coin trail",
    description: "Collect a few coins along the way.",
    level: coins,
  },
  {
    id: "jump",
    name: "One small jump",
    description: "Try a jump between platforms.",
    level: jump,
  },
  {
    id: "gap",
    name: "Mind the gap",
    description: "Explore a level that needs changes.",
    level: gap,
  },
  {
    id: "high",
    name: "A distant goal",
    description: "See what the checker can tell you.",
    level: high,
  },
];
export function sampleLevel(id: string) {
  const sample = samples.find((s) => s.id === id);
  if (!sample) throw new Error("Sample level not found");
  return parseLevel(sample.level);
}
