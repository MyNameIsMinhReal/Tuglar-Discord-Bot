import { ChatInputCommandInteraction, Collection } from 'discord.js';

// ── Command Interface ──────────────────────────────────────────────
export interface BotCommand {
  data: any;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// ── Database Row Types ─────────────────────────────────────────────
export interface DeadlineRow {
  id: number;
  user_id: string;
  guild_id: string;
  channel_id: string;
  title: string;
  subject: string | null;
  due_date: string;
  reminded_1d: number;
  reminded_3h: number;
  reminded_30m: number;
  is_done: number;
  created_at: string;
}

export interface DocumentRow {
  id: number;
  guild_id: string;
  user_id: string;
  subject: string;
  title: string;
  url: string;
  doc_type: string;
  created_at: string;
}

export interface EconomyRow {
  user_id: string;
  guild_id: string;
  balance: number;
  total_earned: number;
  last_daily: string | null;
}

export interface ShopPurchaseRow {
  id: number;
  user_id: string;
  guild_id: string;
  item_id: string;
  item_name: string;
  price: number;
  purchased_at: string;
}

export interface GachaInventoryRow {
  id: number;
  user_id: string;
  guild_id: string;
  item_id: string;
  item_name: string;
  item_rarity: string;
  item_emoji: string;
  obtained_at: string;
}

export interface JournalRow {
  id: number;
  user_id: string;
  content: string;
  mood: string | null;
  created_at: string;
}

export interface ChallengeLogRow {
  user_id: string;
  guild_id: string;
  challenge_date: string;
  challenge_text: string;
  completed: number;
  streak: number;
  used_grace: number;
}

export interface GachaItem {
  id: string;
  name: string;
  rarity: 'SSR' | 'SR' | 'R' | 'N';
  rate: number;
  emoji: string;
  description: string;
  image?: string; // filename trong data/cards/, vd: "sung_jinwoo.png"
}

export interface GachaPool {
  pool: GachaItem[];
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  emoji: string;
  category: 'study' | 'gacha' | 'cosmetic';
}

export interface Challenge {
  text: string;
  category: string;
  emoji: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface GuessGameSession {
  userId: string;
  target: number;
  attempts: number;
  maxAttempts: number;
  startTime: number;
}

// ── Discord Client Extension ───────────────────────────────────────
declare module 'discord.js' {
  interface Client {
    commands: Collection<string, BotCommand>;
  }
}
