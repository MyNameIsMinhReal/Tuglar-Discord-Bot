import { Message, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { db } from '../database';
import { COLOR } from '../utils/embeds';

export const name = 'messageCreate';
export const once = false;

// ── Spam Tracking (in-memory) ──────────────────────────────────────
interface SpamEntry {
  count: number;
  lastMessage: number;
  warned: boolean;
}
const spamMap = new Map<string, SpamEntry>();

const SPAM_THRESHOLD = 5;       // tin nhắn
const SPAM_WINDOW_MS = 5_000;   // trong 5 giây
const WARN_COOLDOWN_MS = 60_000; // 60s trước khi warn lại

// ── Blocked domains ────────────────────────────────────────────────
const BLOCKED_DOMAINS = [
  // URL rút gọn / IP logger
  'bit.ly', 'tinyurl.com', 'short.link',
  'grabify.link', 'iplogger.org', 'discord.gift',
  'free-nitro.ru', 'discordnitro.gift',
  // Casino / cờ bạc crypto scam (loại xuất hiện trong screenshot)
  'dasowin.com', 'stake.com', 'rollbit.com', 'bc.game',
  'roobet.com', 'duelbits.com', 'gamdom.com', 'csgoroll.com',
  'crashino.com', 'trustdice.win', 'bitsler.com',
  // Crypto giveaway / phishing điển hình
  'free-crypto.ru', 'claimbtc.net', 'cryptodrop.live',
  'elon-musk.gift', 'tesla-giveaway.com', 'mrbeast-crypto.com',
];

// ── Scam keyword patterns (crypto giveaway / casino scam) ─────────
// Phát hiện combo: người nổi tiếng/crypto + "nhận/claim/withdraw/bonus"
const SCAM_PATTERNS: RegExp[] = [
  // Celebrity + giveaway + crypto
  /\b(mrbeast|elon\s*musk|binance|coinbase)\b.{0,80}\b(giveaway|give\s*away|tặng|airdrop)\b/is,
  // Claim/withdraw + crypto amount
  /\b(claim|nhận|rút|withdraw)\b.{0,60}\b(\d+\s*(usdt|usd|btc|eth|sol|bnb))\b/is,
  // Free + crypto + link
  /\bfree\b.{0,40}\b(usdt|btc|eth|crypto|coin)\b.{0,60}(http|www|\.com|\.net)/is,
  // Promo code + casino keywords
  /\b(promo\s*code|bonus\s*code|activate\s*code)\b.{0,80}\b(casino|withdraw|bonus|rakeback)\b/is,
  // "Withdrawal Success" fake screenshot bait text
  /withdrawal\s*success/i,
  // Giveaway + register/click/go to
  /\b(giveaway|give\s*away)\b.{0,100}\b(register|sign\s*up|go\s*to|click|danh\s*sách|đăng\s*ký)\b/is,
];

// ── Main handler ───────────────────────────────────────────────────
export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.inGuild()) return;

  const canDelete = message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageMessages);

  await Promise.all([
    checkSpam(message, canDelete),
    checkBlockedLinks(message, canDelete),
    checkScamKeywords(message, canDelete),
  ]);
}

async function checkSpam(message: Message<true>, canDelete: boolean | undefined): Promise<void> {
  const key = `${message.guild!.id}:${message.author.id}`;
  const now = Date.now();
  const entry = spamMap.get(key) ?? { count: 0, lastMessage: 0, warned: false };

  // Reset nếu quá time window
  if (now - entry.lastMessage > SPAM_WINDOW_MS) {
    entry.count = 0;
    entry.warned = false;
  }

  entry.count++;
  entry.lastMessage = now;
  spamMap.set(key, entry);

  // Cleanup map sau 2 phút
  if (spamMap.size > 1000) {
    const cutoff = now - 120_000;
    for (const [k, v] of spamMap) {
      if (v.lastMessage < cutoff) spamMap.delete(k);
    }
  }

  if (entry.count < SPAM_THRESHOLD) return;

  // Xóa tin nhắn spam nếu có quyền
  if (canDelete) {
    try { await message.delete(); } catch { /* bỏ qua nếu đã xóa */ }
  }

  // Chỉ cảnh báo 1 lần trong WARN_COOLDOWN
  if (entry.warned) return;
  entry.warned = true;

  // Lưu warn vào DB
  db.prepare(
    'INSERT INTO warn_log (user_id, guild_id, reason) VALUES (?, ?, ?)'
  ).run(message.author.id, message.guild!.id, 'spam');

  const warnCount = (db.prepare(
    'SELECT COUNT(*) as c FROM warn_log WHERE user_id = ? AND guild_id = ?'
  ).get(message.author.id, message.guild!.id) as any).c;

  const embed = new EmbedBuilder()
    .setColor(COLOR.WARNING)
    .setDescription(
      `⚠️ <@${message.author.id}> Bạn đang gửi tin nhắn quá nhanh!\n` +
      `Vui lòng chậm lại. Số lần cảnh báo: **${warnCount}**`
    );

  try {
    const warn = await message.channel.send({ embeds: [embed] });
    setTimeout(() => warn.delete().catch(() => {}), WARN_COOLDOWN_MS);
  } catch { /* channel có thể bị hạn chế */ }
}

async function checkBlockedLinks(message: Message<true>, canDelete: boolean | undefined): Promise<void> {
  const urlRegex = /https?:\/\/([^\s/]+)/gi;
  const matches = [...message.content.matchAll(urlRegex)];

  for (const match of matches) {
    const domain = match[1].toLowerCase().replace(/^www\./, '');
    const isBlocked = BLOCKED_DOMAINS.some(blocked => domain.includes(blocked));
    if (!isBlocked) continue;

    if (canDelete) {
      try { await message.delete(); } catch {}
    }

    db.prepare(
      'INSERT INTO warn_log (user_id, guild_id, reason) VALUES (?, ?, ?)'
    ).run(message.author.id, message.guild!.id, `blocked_link:${domain}`);

    const embed = new EmbedBuilder()
      .setColor(COLOR.DANGER)
      .setDescription(`🚫 <@${message.author.id}> Link \`${domain}\` không được phép trong server này!`);

    try {
      const warn = await message.channel.send({ embeds: [embed] });
      setTimeout(() => warn.delete().catch(() => {}), 10_000);
    } catch {}

    return; // Chỉ cảnh báo 1 lần
  }
}

async function checkScamKeywords(message: Message<true>, canDelete: boolean | undefined): Promise<void> {
  const text = message.content;
  const matched = SCAM_PATTERNS.find(pattern => pattern.test(text));
  if (!matched) return;

  if (canDelete) {
    try { await message.delete(); } catch {}
  }

  db.prepare(
    'INSERT INTO warn_log (user_id, guild_id, reason) VALUES (?, ?, ?)'
  ).run(message.author.id, message.guild.id, 'scam_keyword');

  const embed = new EmbedBuilder()
    .setColor(COLOR.DANGER)
    .setTitle('🚨 Phát hiện nội dung lừa đảo!')
    .setDescription(
      `<@${message.author.id}> Tin nhắn của bạn bị xóa vì chứa nội dung **scam crypto/giveaway**.\n` +
      `Nếu đây là nhầm lẫn, hãy liên hệ quản trị viên.`
    );

  try {
    const warn = await message.channel.send({ embeds: [embed] });
    setTimeout(() => warn.delete().catch(() => {}), 15_000);
  } catch {}
}
