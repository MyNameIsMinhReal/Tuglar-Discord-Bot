import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, User,
} from 'discord.js';
import * as Profile from '../services/ProfileService';
import * as Achievement from '../services/AchievementService';
import * as Eco from '../services/EconomyService';
import * as Gacha from '../services/GachaService';
import { db } from '../database';
import { COLOR, RARITY_COLORS, RARITY_STARS } from '../utils/embeds';
import { formatCoins } from '../utils/helpers';

// ── Rarity colors for embed ────────────────────────────────────────
const RARITY_EMOJI: Record<string, string> = { N: '⬜', R: '🟫', SR: '🟨', SSR: '🌟' };

const TYPE_LABEL: Record<string, string> = {
  background: '🖼️ Background',
  frame:      '🔲 Frame',
  title:      '🏷️ Title',
  accent:     '🎨 Accent',
  sticker:    '🌀 Sticker',
  name_style: '✍️ Name Style',
};

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Xem và tùy chỉnh profile của bạn')
  .addSubcommand(sub => sub
    .setName('view')
    .setDescription('Xem profile — của bạn hoặc của người khác')
    .addUserOption(o => o.setName('user').setDescription('Người dùng muốn xem (mặc định: bạn)'))
  )
  .addSubcommand(sub => sub
    .setName('equip')
    .setDescription('Trang bị cosmetic đã sở hữu')
    .addStringOption(o => o.setName('item').setDescription('ID của item (lấy từ /profile inventory)').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('unequip')
    .setDescription('Tháo cosmetic đang trang bị')
    .addStringOption(o => o
      .setName('slot')
      .setDescription('Slot muốn tháo')
      .setRequired(true)
      .addChoices(
        { name: '🖼️ Background', value: 'background' },
        { name: '🔲 Frame', value: 'frame' },
        { name: '🏷️ Title', value: 'title' },
        { name: '🎨 Accent', value: 'accent' },
        { name: '🌀 Sticker', value: 'sticker' },
      )
    )
  )
  .addSubcommand(sub => sub.setName('inventory').setDescription('Xem kho cosmetic đã sở hữu'))
  .addSubcommand(sub => sub.setName('achievements').setDescription('Xem thành tích đã đạt được'))
  .addSubcommand(sub => sub
    .setName('shop')
    .setDescription('Xem shop cosmetic')
    .addStringOption(o => o
      .setName('type')
      .setDescription('Lọc theo loại (mặc định: tất cả)')
      .setRequired(false)
      .addChoices(
        { name: '🏷️ Title', value: 'title' },
        { name: '🎨 Accent', value: 'accent' },
        { name: '🖼️ Background', value: 'background' },
        { name: '🔲 Frame', value: 'frame' },
      )
    )
  )
  .addSubcommand(sub => sub
    .setName('buy')
    .setDescription('Mua cosmetic từ shop')
    .addStringOption(o => o.setName('item').setDescription('ID của item muốn mua').setRequired(true))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'view':         return handleView(interaction);
    case 'equip':        return handleEquip(interaction);
    case 'unequip':      return handleUnequip(interaction);
    case 'inventory':    return handleInventory(interaction);
    case 'achievements': return handleAchievements(interaction);
    case 'shop':         return handleShop(interaction);
    case 'buy':          return handleBuy(interaction);
  }
}

// ── View ───────────────────────────────────────────────────────────
async function handleView(i: ChatInputCommandInteraction): Promise<void> {
  const target: User = i.options.getUser('user') ?? i.user;
  const guildId = i.guildId!;

  const eco      = Eco.getOrCreate(target.id, guildId);
  const settings = Profile.getSettings(target.id, guildId);
  const badges   = Achievement.getUserAchievements(target.id, guildId);
  const total    = Gacha.getTotalRolls(target.id, guildId);

  // Equipped items
  const equippedTitle = settings.title_id ? Profile.getById(settings.title_id) : null;
  const equippedBg    = settings.background_id ? Profile.getById(settings.background_id) : null;
  const equippedFrame = settings.frame_id ? Profile.getById(settings.frame_id) : null;
  const equippedAccent = settings.accent_id ? Profile.getById(settings.accent_id) : null;

  // Pick accent color for embed
  const ACCENT_COLORS: Record<string, number> = {
    accent_blue: 0x3498DB, accent_red: 0xE74C3C, accent_purple: 0x9B59B6,
    accent_neon: 0x00FF7F, accent_gold: 0xF1C40F,
  };
  const embedColor = settings.accent_id ? (ACCENT_COLORS[settings.accent_id] ?? COLOR.PRIMARY) : COLOR.PRIMARY;

  // Current streak
  const streakRow = db.prepare(
    'SELECT streak FROM challenge_log WHERE user_id = ? AND guild_id = ? AND completed = 1 ORDER BY challenge_date DESC LIMIT 1'
  ).get(target.id, guildId) as { streak: number } | undefined;
  const streak = streakRow?.streak ?? 0;

  // Best gacha card
  const bestCard = db.prepare(`
    SELECT item_rarity, item_emoji, item_name FROM gacha_inventory
    WHERE user_id = ? AND guild_id = ?
    ORDER BY CASE item_rarity WHEN 'SSR' THEN 0 WHEN 'SR' THEN 1 WHEN 'R' THEN 2 ELSE 3 END LIMIT 1
  `).get(target.id, guildId) as { item_rarity: string; item_emoji: string; item_name: string } | undefined;

  // Prestige (from economy table, may be 0 if column not added yet)
  const prestigeRow = db.prepare(
    'SELECT prestige_points FROM economy WHERE user_id = ? AND guild_id = ?'
  ).get(target.id, guildId) as { prestige_points: number } | undefined;
  const prestige = prestigeRow?.prestige_points ?? 0;

  const titleStr = equippedTitle ? `*${equippedTitle.name}*` : '';
  const cosmeticLines: string[] = [];
  if (equippedBg)    cosmeticLines.push(`${TYPE_LABEL.background}: **${equippedBg.name}**`);
  if (equippedFrame) cosmeticLines.push(`${TYPE_LABEL.frame}: **${equippedFrame.name}**`);
  if (equippedAccent) cosmeticLines.push(`${TYPE_LABEL.accent}: **${equippedAccent.name}**`);

  const badgeStr = badges.length > 0
    ? badges.slice(0, 8).map(b => `${b.emoji} ${b.name}`).join('  ·  ')
    : '*Chưa có thành tích nào*';

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(titleStr ? `${target.displayName} — ${titleStr}` : target.displayName)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: '💰 Economy',
        value: [
          `Coins: **${formatCoins(eco.balance)}**`,
          `Total Earned: ${formatCoins(eco.total_earned)}`,
          prestige > 0 ? `✨ Prestige: **${prestige} pts**` : null,
        ].filter(Boolean).join('  ·  '),
        inline: false,
      },
      {
        name: '📊 Stats',
        value: [
          `🔥 Streak: **${streak} ngày**`,
          `🎴 Gacha Rolls: **${total}**`,
          bestCard ? `Best Card: ${bestCard.item_emoji} **${bestCard.item_name}** (${bestCard.item_rarity})` : null,
        ].filter(Boolean).join('  ·  '),
        inline: false,
      },
      {
        name: `🏅 Achievements (${badges.length})`,
        value: badgeStr,
        inline: false,
      },
    );

  if (cosmeticLines.length > 0) {
    embed.addFields({ name: '🎨 Profile Cosmetics', value: cosmeticLines.join('\n'), inline: false });
  }

  embed.setFooter({ text: `Dùng /profile equip để trang bị cosmetics · /profile shop để mua` });

  await i.reply({ embeds: [embed] });
}

// ── Equip ──────────────────────────────────────────────────────────
async function handleEquip(i: ChatInputCommandInteraction): Promise<void> {
  const itemId = i.options.getString('item', true).trim();
  const result = Profile.equipCosmetic(i.user.id, i.guildId!, itemId);

  if (!result.success) {
    await i.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription(`❌ ${result.error}`)],
      ephemeral: true,
    });
    return;
  }

  const item = result.item!;
  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('✅ Trang bị thành công!')
      .setDescription(`${TYPE_LABEL[item.type] ?? item.type}: **${item.name}** đã được trang bị.\nXem profile với \`/profile view\`.`)],
    ephemeral: true,
  });
}

// ── Unequip ────────────────────────────────────────────────────────
async function handleUnequip(i: ChatInputCommandInteraction): Promise<void> {
  const slot = i.options.getString('slot', true);
  const ok = Profile.unequipSlot(i.user.id, i.guildId!, slot);

  if (!ok) {
    await i.reply({ content: `❌ Slot \`${slot}\` không hợp lệ.`, ephemeral: true });
    return;
  }
  await i.reply({
    embeds: [new EmbedBuilder().setColor(COLOR.INFO).setDescription(`🔲 Đã tháo ${TYPE_LABEL[slot] ?? slot}.`)],
    ephemeral: true,
  });
}

// ── Inventory ──────────────────────────────────────────────────────
async function handleInventory(i: ChatInputCommandInteraction): Promise<void> {
  const owned   = Profile.getOwned(i.user.id, i.guildId!);
  const settings = Profile.getSettings(i.user.id, i.guildId!);

  if (owned.length === 0) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.INFO)
        .setDescription('Kho trống. Dùng `/profile shop` để xem và mua cosmetics!')],
      ephemeral: true,
    });
    return;
  }

  const equipped = new Set([
    settings.background_id, settings.frame_id, settings.title_id,
    settings.accent_id, settings.sticker_id, settings.name_style_id,
  ].filter(Boolean) as string[]);

  // Group by type
  const grouped = new Map<string, string[]>();
  for (const o of owned) {
    const item = Profile.getById(o.cosmetic_id);
    if (!item) continue;
    if (!grouped.has(item.type)) grouped.set(item.type, []);
    const eq = equipped.has(o.cosmetic_id) ? ' ✅' : '';
    const expiry = o.expires_at ? ` *(hết ${new Date(o.expires_at).toLocaleDateString('vi-VN')})*` : '';
    grouped.get(item.type)!.push(`\`${item.id}\` ${RARITY_EMOJI[item.rarity]} **${item.name}**${eq}${expiry}`);
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle(`🗄️ Kho cosmetic — ${i.user.displayName}`)
    .setFooter({ text: '✅ = đang trang bị · Dùng /profile equip <id> để trang bị' });

  for (const [type, lines] of grouped) {
    embed.addFields({ name: TYPE_LABEL[type] ?? type, value: lines.join('\n') });
  }

  await i.reply({ embeds: [embed], ephemeral: true });
}

// ── Achievements ───────────────────────────────────────────────────
async function handleAchievements(i: ChatInputCommandInteraction): Promise<void> {
  const all     = Achievement.getAllDefs();
  const earned  = new Set(Achievement.getUserAchievements(i.user.id, i.guildId!).map(a => a.id));

  const lines = all.map(a => {
    const have = earned.has(a.id);
    return `${have ? a.emoji : '🔒'} **${a.name}**${have ? '' : ' *(chưa mở)*'}\n └ ${a.description}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle(`🏅 Achievements — ${i.user.displayName}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${earned.size} / ${all.length} thành tích đã mở khóa` });

  await i.reply({ embeds: [embed], ephemeral: true });
}

// ── Shop ───────────────────────────────────────────────────────────
async function handleShop(i: ChatInputCommandInteraction): Promise<void> {
  const typeFilter = i.options.getString('type');
  const eco        = Eco.getOrCreate(i.user.id, i.guildId!);
  const items      = typeFilter ? Profile.getByType(typeFilter) : Profile.getCatalog();
  const owned      = new Set(Profile.getOwned(i.user.id, i.guildId!).map(o => o.cosmetic_id));

  const RARITY_ORDER: Record<string, number> = { N: 0, R: 1, SR: 2, SSR: 3 };
  const sorted = [...items].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.price - b.price);

  const grouped = new Map<string, string[]>();
  for (const item of sorted) {
    if (!grouped.has(item.type)) grouped.set(item.type, []);
    const have  = owned.has(item.id) ? ' ✅' : '';
    const afford = eco.balance >= item.price ? '' : ' *(không đủ tiền)*';
    grouped.get(item.type)!.push(
      `${RARITY_EMOJI[item.rarity]} **${item.name}** — \`${formatCoins(item.price)}\` coins${have}${afford}\n └ ${item.description} · ID: \`${item.id}\``
    );
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle('🛍️ Profile Cosmetic Shop')
    .setDescription(`Ví: **${formatCoins(eco.balance)} coins** · Dùng \`/profile buy <id>\` để mua`)
    .setFooter({ text: '✅ = đã sở hữu · Mua là unlock vĩnh viễn!' });

  for (const [type, lines] of grouped) {
    embed.addFields({ name: TYPE_LABEL[type] ?? type, value: lines.join('\n') });
  }

  await i.reply({ embeds: [embed] });
}

// ── Buy ────────────────────────────────────────────────────────────
async function handleBuy(i: ChatInputCommandInteraction): Promise<void> {
  const itemId = i.options.getString('item', true).trim();
  const result = Profile.buyCosmetic(i.user.id, i.guildId!, itemId);

  if (!result.success) {
    await i.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription(`❌ ${result.error}`)],
      ephemeral: true,
    });
    return;
  }

  const item    = result.item!;
  const eco     = Eco.getOrCreate(i.user.id, i.guildId!);
  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(RARITY_COLORS[item.rarity] ?? COLOR.SUCCESS)
      .setTitle('🎉 Mua thành công!')
      .setDescription(
        `${RARITY_EMOJI[item.rarity]} **${item.name}** (${item.type})\n${item.description}\n\n` +
        `Dùng \`/profile equip item:${item.id}\` để trang bị.`
      )
      .addFields({ name: '👛 Còn lại', value: `${formatCoins(eco.balance)} coins`, inline: true })],
  });
}
