import path from 'node:path';
import fs from 'node:fs';
import { db } from '../database';

// ── Types ──────────────────────────────────────────────────────────
export interface ProfileCosmetic {
  id: string;
  name: string;
  type: 'background' | 'frame' | 'title' | 'accent' | 'sticker' | 'name_style';
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  price: number;
  description: string;
  isLimited?: boolean;
  availableUntil?: string;
}

export interface ProfileSettings {
  background_id: string | null;
  frame_id: string | null;
  title_id: string | null;
  accent_id: string | null;
  sticker_id: string | null;
  name_style_id: string | null;
  badge_slot_1: string | null;
  badge_slot_2: string | null;
  badge_slot_3: string | null;
}

export interface OwnedCosmetic {
  cosmetic_id: string;
  unlocked_at: string;
  expires_at: string | null;
}

// ── Data Loading ───────────────────────────────────────────────────
let catalog: ProfileCosmetic[] = [];
try {
  catalog = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data', 'profile_cosmetics.json'), 'utf-8')
  );
} catch {
  catalog = [];
}

export function getCatalog(): ProfileCosmetic[] { return catalog; }
export function getById(id: string): ProfileCosmetic | undefined { return catalog.find(c => c.id === id); }
export function getByType(type: string): ProfileCosmetic[] { return catalog.filter(c => c.type === type); }

// ── Ownership ──────────────────────────────────────────────────────
export function getOwned(userId: string, guildId: string): OwnedCosmetic[] {
  return db.prepare(
    'SELECT cosmetic_id, unlocked_at, expires_at FROM user_cosmetics WHERE user_id = ? AND guild_id = ?'
  ).all(userId, guildId) as unknown as OwnedCosmetic[];
}

export function isOwned(userId: string, guildId: string, cosmeticId: string): boolean {
  const row = db.prepare(
    'SELECT expires_at FROM user_cosmetics WHERE user_id = ? AND guild_id = ? AND cosmetic_id = ?'
  ).get(userId, guildId, cosmeticId) as { expires_at: string | null } | undefined;
  if (!row) return false;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return false;
  return true;
}

export function unlockCosmetic(userId: string, guildId: string, cosmeticId: string, expiresAt?: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO user_cosmetics (user_id, guild_id, cosmetic_id, unlocked_at, expires_at)
    VALUES (?, ?, ?, datetime('now'), ?)
  `).run(userId, guildId, cosmeticId, expiresAt ?? null);
}

// ── Buy ────────────────────────────────────────────────────────────
import * as Eco from './EconomyService';

export function buyCosmetic(
  userId: string, guildId: string, cosmeticId: string
): { success: boolean; error?: string; item?: ProfileCosmetic } {
  const item = getById(cosmeticId);
  if (!item) return { success: false, error: `Không tìm thấy item \`${cosmeticId}\`.` };

  if (item.availableUntil && new Date(item.availableUntil) < new Date()) {
    return { success: false, error: 'Item này đã hết hạn bán.' };
  }

  if (isOwned(userId, guildId, cosmeticId)) {
    return { success: false, error: 'Bạn đã sở hữu item này rồi.' };
  }

  const ok = Eco.deductCoins(userId, guildId, item.price);
  if (!ok) {
    const user = Eco.getOrCreate(userId, guildId);
    return { success: false, error: `Không đủ coins! Cần **${item.price}**, bạn có **${user.balance}**.` };
  }

  unlockCosmetic(userId, guildId, cosmeticId);
  Eco.logTransaction(userId, guildId, -item.price, 'profile_buy', `item:${cosmeticId}`);
  return { success: true, item };
}

// ── Equip ──────────────────────────────────────────────────────────
const TYPE_TO_COL: Record<string, string> = {
  background: 'background_id',
  frame:      'frame_id',
  title:      'title_id',
  accent:     'accent_id',
  sticker:    'sticker_id',
  name_style: 'name_style_id',
};

export function equipCosmetic(
  userId: string, guildId: string, cosmeticId: string
): { success: boolean; error?: string; item?: ProfileCosmetic } {
  if (!isOwned(userId, guildId, cosmeticId)) {
    return { success: false, error: 'Bạn chưa sở hữu item này. Dùng `/profile buy` để mua.' };
  }

  const item = getById(cosmeticId);
  if (!item) return { success: false, error: 'Item không tồn tại trong danh mục.' };

  const col = TYPE_TO_COL[item.type];
  if (!col) return { success: false, error: `Loại \`${item.type}\` không hỗ trợ equip.` };

  // col is from a hardcoded map, safe to interpolate
  db.prepare(`
    INSERT INTO user_profile_settings (user_id, guild_id, ${col}, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, guild_id) DO UPDATE SET ${col} = ?, updated_at = datetime('now')
  `).run(userId, guildId, cosmeticId, cosmeticId);

  return { success: true, item };
}

export function unequipSlot(userId: string, guildId: string, slot: string): boolean {
  const col = TYPE_TO_COL[slot];
  if (!col) return false;
  db.prepare(`
    INSERT INTO user_profile_settings (user_id, guild_id, ${col}, updated_at)
    VALUES (?, ?, NULL, datetime('now'))
    ON CONFLICT(user_id, guild_id) DO UPDATE SET ${col} = NULL, updated_at = datetime('now')
  `).run(userId, guildId);
  return true;
}

// ── Badge Slots ────────────────────────────────────────────────────
export function equipBadge(userId: string, guildId: string, badgeId: string, slot: 1 | 2 | 3): boolean {
  const col = `badge_slot_${slot}` as const;
  db.prepare(`
    INSERT INTO user_profile_settings (user_id, guild_id, ${col}, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, guild_id) DO UPDATE SET ${col} = ?, updated_at = datetime('now')
  `).run(userId, guildId, badgeId, badgeId);
  return true;
}

// ── Profile Settings ───────────────────────────────────────────────
export function getSettings(userId: string, guildId: string): ProfileSettings {
  const row = db.prepare(
    'SELECT * FROM user_profile_settings WHERE user_id = ? AND guild_id = ?'
  ).get(userId, guildId) as unknown as ProfileSettings | undefined;
  return row ?? {
    background_id: null, frame_id: null, title_id: null,
    accent_id: null, sticker_id: null, name_style_id: null,
    badge_slot_1: null, badge_slot_2: null, badge_slot_3: null,
  };
}
