import path from 'path';
import fs from 'fs';
import { db } from '../database';
import { GachaItem, GachaPool } from '../types';
import { cfg } from '../config';

let pool: GachaItem[] = [];

export function loadGachaPool(): void {
  const poolPath = path.join(process.cwd(), 'data', 'gacha_pool.json');
  const data: GachaPool = JSON.parse(fs.readFileSync(poolPath, 'utf-8'));
  pool = data.pool;
  console.log(`✅ Gacha pool loaded: ${pool.length} items`);
}

export function rollGacha(): GachaItem {
  const totalWeight = pool.reduce((s, item) => s + item.rate, 0);
  let rand = Math.random() * totalWeight;
  for (const item of pool) {
    rand -= item.rate;
    if (rand <= 0) return item;
  }
  return pool[pool.length - 1];
}

function rollFromSubset(subset: GachaItem[]): GachaItem {
  const totalWeight = subset.reduce((s, it) => s + it.rate, 0);
  let rand = Math.random() * totalWeight;
  for (const item of subset) {
    rand -= item.rate;
    if (rand <= 0) return item;
  }
  return subset.at(-1) ?? subset[0];
}

// ── Pity System ────────────────────────────────────────────────────
function getPity(userId: string, guildId: string): { rolls_since_ssr: number; rolls_since_sr: number } {
  const row = db.prepare(
    'SELECT rolls_since_ssr, rolls_since_sr FROM gacha_pity WHERE user_id = ? AND guild_id = ?'
  ).get(userId, guildId) as { rolls_since_ssr: number; rolls_since_sr: number } | undefined;
  return row ?? { rolls_since_ssr: 0, rolls_since_sr: 0 };
}

function setPity(userId: string, guildId: string, sinceSSR: number, sinceSR: number): void {
  db.prepare(`
    INSERT INTO gacha_pity (user_id, guild_id, rolls_since_ssr, rolls_since_sr)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET
      rolls_since_ssr = ?,
      rolls_since_sr  = ?
  `).run(userId, guildId, sinceSSR, sinceSR, sinceSSR, sinceSR);
}

// Roll với pity:
//   ≥ 80 rolls chưa Legendary  → guaranteed Legendary (hard pity)
//   ≥ 10 rolls chưa Epic+      → guaranteed Epic+ (hard pity)
//   ≥ 50 rolls chưa Legendary  → soft pity, rate Legendary tăng dần
export function rollGachaWithPity(userId: string, guildId: string): GachaItem {
  const pity = getPity(userId, guildId);
  let item: GachaItem;

  const { ssrHard, ssrSoft, srHard } = cfg.gachaPity;

  if (pity.rolls_since_ssr >= ssrHard) {
    const legendaryItems = pool.filter(p => p.rarity === 'Legendary');
    item = rollFromSubset(legendaryItems.length > 0 ? legendaryItems : pool);
  } else if (pity.rolls_since_sr >= srHard) {
    const epicItems = pool.filter(p => p.rarity === 'Epic' || p.rarity === 'Legendary');
    item = rollFromSubset(epicItems.length > 0 ? epicItems : pool);
  } else if (pity.rolls_since_ssr >= ssrSoft) {
    // Soft pity: mỗi roll sau ssrSoft tăng thêm 10% multiplier lên Legendary rate
    const boost = 1 + (pity.rolls_since_ssr - ssrSoft) * 0.10;
    const modPool = pool.map(p => ({ ...p, rate: p.rarity === 'Legendary' ? p.rate * boost : p.rate }));
    const total = modPool.reduce((s, p) => s + p.rate, 0);
    let rand = Math.random() * total;
    item = pool[pool.length - 1];
    for (let i = 0; i < modPool.length; i++) {
      rand -= modPool[i].rate;
      if (rand <= 0) { item = pool[i]; break; }
    }
  } else {
    item = rollGacha();
  }

  const isLegendary = item.rarity === 'Legendary';
  const isEpicPlus  = isLegendary || item.rarity === 'Epic';
  setPity(
    userId, guildId,
    isLegendary ? 0 : pity.rolls_since_ssr + 1,
    isEpicPlus  ? 0 : pity.rolls_since_sr  + 1,
  );

  return item;
}

// Pack: mỗi lá roll qua pity, đảm bảo ít nhất 1 lá R+ nếu tất cả ra N
export function rollPackWithPity(userId: string, guildId: string, size = 5): GachaItem[] {
  const items: GachaItem[] = [];
  for (let i = 0; i < size; i++) {
    items.push(rollGachaWithPity(userId, guildId));
  }

  // Safety net: nếu tất cả N thì ép lá đầu thành R+
  if (!items.some(it => it.rarity !== 'Common')) {
    const rarePool = pool.filter(p => p.rarity !== 'Common');
    if (rarePool.length > 0) items[0] = rollFromSubset(rarePool);
  }

  // Fisher-Yates shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Legacy — vẫn dùng trong pool display
export function rollPack(size = 5): GachaItem[] {
  const rarePool = pool.filter(p => p.rarity !== 'Common');
  const guaranteed = rarePool.length > 0 ? rollFromSubset(rarePool) : rollGacha();
  const cards: GachaItem[] = [guaranteed];
  for (let i = 1; i < size; i++) cards.push(rollGacha());
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function getPool(): GachaItem[] { return [...pool]; }

export function getPityInfo(userId: string, guildId: string) {
  return getPity(userId, guildId);
}

export function saveToInventory(userId: string, guildId: string, item: GachaItem): void {
  db.prepare(`
    INSERT INTO gacha_inventory (user_id, guild_id, item_id, item_name, item_rarity, item_emoji)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, guildId, item.id, item.name, item.rarity, item.emoji);
}

export function getInventory(userId: string, guildId: string) {
  return db.prepare(`
    SELECT item_rarity, item_emoji, item_name, COUNT(*) as count
    FROM gacha_inventory
    WHERE user_id = ? AND guild_id = ?
    GROUP BY item_id, item_name
    ORDER BY CASE item_rarity WHEN 'Legendary' THEN 0 WHEN 'Epic' THEN 1 WHEN 'Rare' THEN 2 ELSE 3 END
  `).all(userId, guildId) as Array<{ item_rarity: string; item_emoji: string; item_name: string; count: number }>;
}

export function getTotalRolls(userId: string, guildId: string): number {
  const row = db.prepare(
    'SELECT COUNT(*) as total FROM gacha_inventory WHERE user_id = ? AND guild_id = ?'
  ).get(userId, guildId) as { total: number };
  return row?.total ?? 0;
}

export function getSSRCount(userId: string, guildId: string): number {
  const row = db.prepare(
    "SELECT COUNT(*) as cnt FROM gacha_inventory WHERE user_id = ? AND guild_id = ? AND item_rarity = 'Legendary'"
  ).get(userId, guildId) as { cnt: number };
  return row?.cnt ?? 0;
}
