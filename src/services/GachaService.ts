import path from 'path';
import fs from 'fs';
import { db } from '../database';
import { GachaItem, GachaPool } from '../types';

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
  return subset.at(-1) ?? subset[0];;
}

// Guaranteed at least 1 R+ card in the pack; rest are normal weighted random.
export function rollPack(size = 5): GachaItem[] {
  const rarePool = pool.filter(p => p.rarity !== 'N');
  const guaranteed = rarePool.length > 0 ? rollFromSubset(rarePool) : rollGacha();

  const cards: GachaItem[] = [guaranteed];
  for (let i = 1; i < size; i++) cards.push(rollGacha());

  // Fisher-Yates shuffle so guaranteed card isn't always in a fixed spot
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function getPool(): GachaItem[] { return [...pool]; }

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
    ORDER BY CASE item_rarity WHEN 'SSR' THEN 0 WHEN 'SR' THEN 1 WHEN 'R' THEN 2 ELSE 3 END
  `).all(userId, guildId) as Array<{ item_rarity: string; item_emoji: string; item_name: string; count: number }>;
}

export function getTotalRolls(userId: string, guildId: string): number {
  const row = db.prepare(
    'SELECT COUNT(*) as total FROM gacha_inventory WHERE user_id = ? AND guild_id = ?'
  ).get(userId, guildId) as { total: number };
  return row?.total ?? 0;
}
