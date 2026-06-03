const BLOCKED: RegExp[] = [
  // NSFW / 18+
  /boku\s*no\s*pico/i,
  /\bhentai\b/i,
  /\bporn(ography)?\b/i,
  /\bnsfw\b/i,
  /\br-?18\b/i,
  /\b18\s*\+/i,
  /\bsex(ual)?\b/i,
  /\bloli(con)?\b/i,
  /\bshota(con)?\b/i,
  /\becchi\b/i,

  // Bạo lực / có hại
  /\bsuicide\b/i,
  /\bself.?harm\b/i,
  /\bgore\b/i,
  /\btorture\b/i,

  // Chất cấm / vũ khí
  /\bdrug(s)?\b/i,
  /\bcocaine\b/i,
  /\bheroin\b/i,
  /\bbomb.?making\b/i,
];

export function isTopicBlocked(topic: string): boolean {
  return BLOCKED.some(p => p.test(topic));
}
