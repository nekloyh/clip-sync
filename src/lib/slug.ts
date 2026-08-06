const ADJECTIVES = [
  "quiet", "swift", "clever", "bright", "calm", "gentle", "happy", "brave",
  "silent", "eager", "cozy", "noble", "vibrant", "zen", "keen", "fuzzy",
  "sleek", "nimble", "misty", "cosmic", "solar", "lunar", "wild", "mellow"
];

const NOUNS = [
  "fox", "owl", "bear", "wolf", "hawk", "lion", "tiger", "deer",
  "koala", "panda", "otter", "eagle", "falcon", "lynx", "hare", "robin",
  "dolph", "breeze", "comet", "orbit", "pulse", "spark", "node", "stream"
];

export function generateRandomSlug(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  return `${adj}-${noun}-${num}`;
}
