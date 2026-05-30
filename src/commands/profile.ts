import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, User, AttachmentBuilder,
  StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  GuildMember, Role, MessageComponentInteraction,
  MessageFlags,
} from 'discord.js';
import {
  BOOSTER_ROLE_ID, BOOSTER_TIERS, ALL_COLOR_ROLES, FOOTER_TEXT as BOOSTER_FOOTER,
} from '../services/BoosterService';
import * as Profile from '../services/ProfileService';
import * as Achievement from '../services/AchievementService';
import * as Eco from '../services/EconomyService';
import * as Gacha from '../services/GachaService';
import { db } from '../database';
import { COLOR, RARITY_COLORS } from '../utils/embeds';
import { formatCoins } from '../utils/helpers';
import { renderProfileCard } from '../utils/profileCanvas';

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

// ── Booster Color Packs (Đã tối ưu sang chuỗi thô để dễ copy/paste) ──
const COLOR_PACK_1 = [
  { label: 'Sky',    value: '1162545019123666984', emoji: '<:IC_Sky:1510155404296847381>' },
  { label: 'Carrot', value: '1157296480722366555', emoji: '<:IC_Carrot:1510155381723103232>' },
  { label: 'Rose',   value: '1157297666879926304', emoji: '<:IC_Rose:1510155402430386227>' },
  { label: 'Purple', value: '1157298499461840906', emoji: '<:IC_Purple:1510155400752791572>' },
  { label: 'Peachy', value: '1157298054764974130', emoji: '<:IC_Peachy:1510155398513164358>' },
];

const COLOR_PACK_2 = [
  { label: 'Mint',        value: '1164764867769667664', emoji: '<:IC_Mint:1510155388387856457>' },
  { label: 'xLemon',      value: '1164766440335876126', emoji: '<:IC_xLemon:1510155408285765673>' },
  { label: '1stHeart',    value: '1510012176876699768', emoji: '<:IC_1stHeart:1510155379047399474>' },
  { label: 'Cyber-20xx',  value: '1164946570920337538', emoji: '<:IC_Cyber20xx:1510155383799549962>' },
  { label: 'TraDaoCamSa', value: '1164946156858650635', emoji: '<:IC_TraDaoCamSa:1510155406297530398>' },
];

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Xem profile của bạn hoặc người khác')
  .addUserOption(o => o.setName('user').setDescription('Người dùng muốn xem (mặc định: bạn)'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  return handleView(interaction);
}

async function handleView(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply();

  const target: User   = i.options.getUser('user') ?? i.user;
  const isOwn: boolean = target.id === i.user.id;
  const guildId = i.guildId!;

  const eco      = Eco.getOrCreate(target.id, guildId);
  const settings = Profile.getSettings(target.id, guildId);
  const badges   = Achievement.getUserAchievements(target.id, guildId);
  const total    = Gacha.getTotalRolls(target.id, guildId);

  const equippedTitle  = settings.title_id  ? Profile.getById(settings.title_id)  : null;
  const equippedBg     = settings.background_id ? Profile.getById(settings.background_id) : null;
  const equippedFrame  = settings.frame_id  ? Profile.getById(settings.frame_id)  : null;
  const equippedAccent = settings.accent_id ? Profile.getById(settings.accent_id) : null;

  const ACCENT_COLORS: Record<string, number> = {
    accent_blue: 0x3498DB, accent_red: 0xE74C3C, accent_purple: 0x9B59B6,
    accent_neon: 0x00FF7F, accent_gold: 0xF1C40F,
  };
  const embedColor = settings.accent_id ? (ACCENT_COLORS[settings.accent_id] ?? COLOR.PRIMARY) : COLOR.PRIMARY;

  const streakRow = db.prepare(
    'SELECT streak FROM challenge_log WHERE user_id = ? AND guild_id = ? AND completed = 1 ORDER BY challenge_date DESC LIMIT 1'
  ).get(target.id, guildId) as { streak: number } | undefined;
  const streak = streakRow?.streak ?? 0;

  const bestCard = db.prepare(`
    SELECT item_rarity, item_emoji, item_name FROM gacha_inventory
    WHERE user_id = ? AND guild_id = ?
    ORDER BY CASE item_rarity WHEN 'SSR' THEN 0 WHEN 'SR' THEN 1 WHEN 'R' THEN 2 ELSE 3 END LIMIT 1
  `).get(target.id, guildId) as { item_rarity: string; item_emoji: string; item_name: string } | undefined;

  const prestigeRow = db.prepare(
    'SELECT prestige_points FROM economy WHERE user_id = ? AND guild_id = ?'
  ).get(target.id, guildId) as { prestige_points: number } | undefined;
  const prestige = prestigeRow?.prestige_points ?? 0;

  const titleStr = equippedTitle ? `*${equippedTitle.name}*` : '';
  const cosmeticLines: string[] = [];
  if (equippedBg)     cosmeticLines.push(`${TYPE_LABEL.background}: **${equippedBg.name}**`);
  if (equippedFrame)  cosmeticLines.push(`${TYPE_LABEL.frame}: **${equippedFrame.name}**`);
  if (equippedAccent) cosmeticLines.push(`${TYPE_LABEL.accent}: **${equippedAccent.name}**`);

  const badgeStr = badges.length > 0
    ? badges.slice(0, 8).map(b => `${b.emoji} ${b.name}`).join('  ·  ')
    : '*Chưa có thành tích nào*';

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(titleStr ? `${target.displayName} — ${titleStr}` : target.displayName)
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

  // Quy hoạch lại 4 nút bấm chuẩn Form của Trang cá nhân tổng hợp
  const navRow = isOwn
    ? new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('prof_shop').setLabel('🛍️ Shop').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('prof_ach').setLabel('🏅 Thành tích').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('prof_inv').setLabel('🎨 Tủ đồ Trang trí').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('prof_cards').setLabel('🃏 Bộ sưu tập Thẻ bài').setStyle(ButtonStyle.Secondary),
      )
    : null;
  const components = navRow ? [navRow] : [];

  try {
    const { buffer: cardBuf, filename: cardFile } = await renderProfileCard({
      username:     target.displayName,
      avatarUrl:    target.displayAvatarURL({ size: 256, extension: 'png' }),
      title:        equippedTitle?.name ?? null,
      backgroundId: settings.background_id,
      frameId:      settings.frame_id,
      accentId:     settings.accent_id,
      coins:        eco.balance,
      streak,
      totalRolls:   total,
      bestCard:     bestCard ? `${bestCard.item_name} (${bestCard.item_rarity})` : null,
      badges,
    });
    const attachment = new AttachmentBuilder(cardBuf, { name: cardFile });
    embed.setImage(`attachment://${cardFile}`);
    await i.editReply({ embeds: [embed], files: [cardBuf ? attachment : null].filter((f): f is AttachmentBuilder => f !== null), components });
  } catch {
    embed.setThumbnail(target.displayAvatarURL({ size: 256 }));
    await i.editReply({ embeds: [embed], components });
  }

  if (!navRow) return;

  const msg = await i.fetchReply();
  const collector = msg.createMessageComponentCollector({
    filter: c => c.user.id === i.user.id,
    time: 300_000,
  });

  collector.on('collect', async btn => {
    const guild = i.guild!;
    if (btn.customId === 'prof_inv')  await showInventory(btn as MessageComponentInteraction, guild);
    else if (btn.customId === 'prof_shop') await showShop(btn as MessageComponentInteraction, guild);
    else if (btn.customId === 'prof_ach')  await showAchievements(btn as MessageComponentInteraction);
    else if (btn.customId === 'prof_cards') await showCardInventory(btn as MessageComponentInteraction);
  });

  collector.on('end', () => { i.editReply({ components: [] }).catch(() => {}); });
}

function getUserTier(member: GuildMember): number {
  if (Object.values(BOOSTER_TIERS).some(id => member.roles.cache.has(id))) return 2;
  if (member.roles.cache.has(BOOSTER_ROLE_ID)) return 1;
  return 0;
}

function buildBoosterRows(tier: number): ActionRowBuilder<any>[] {
  if (tier === 0) return [];
  const rows: ActionRowBuilder<any>[] = [];

  if (tier >= 1) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('booster_pack1')
          .setPlaceholder('🎨 Color Pack - Booster Gốc')
          .addOptions(
            { label: 'Gỡ Role Màu', value: '0', emoji: '❌' },
            ...COLOR_PACK_1.map(c => ({ label: c.label, value: c.value, emoji: c.emoji })),
          ),
      ),
    );
  }

  if (tier >= 2) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('booster_pack2')
          .setPlaceholder('🎨 Color Pack - Booster I')
          .addOptions(
            { label: 'Gỡ Role Màu', value: '0', emoji: '❌' },
            ...COLOR_PACK_2.map(c => ({ label: c.label, value: c.value, emoji: c.emoji })),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('booster_clear')
        .setLabel('Gỡ Toàn Bộ Màu & Icon')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  return rows;
}

async function applyColorRole(
  comp: MessageComponentInteraction,
  guild: import('discord.js').Guild,
  userId: string,
  selectedValue: string,
): Promise<void> {
  const member = guild.members.cache.get(userId)
    ?? await guild.members.fetch(userId).catch(() => null);

  if (!member) {
    await comp.reply({ embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('❌ Không tìm thấy member.')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (selectedValue === 'clear' || selectedValue === '0') {
    const toRemove = ALL_COLOR_ROLES
      .map(id => guild.roles.cache.get(id))
      .filter((r): r is Role => !!r && member.roles.cache.has(r.id));
    if (toRemove.length) await member.roles.remove(toRemove);
    await comp.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('🗑️・Đã thu hồi role thành công!').setFooter({ text: BOOSTER_FOOTER })],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newRole = guild.roles.cache.get(selectedValue);
  if (!newRole) {
    await comp.reply({ embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('❌ Role không tồn tại.')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (member.roles.cache.has(selectedValue)) {
    await member.roles.remove(newRole);
    await comp.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setTitle(`Đã gỡ bỏ role: ${newRole.name}`).setFooter({ text: BOOSTER_FOOTER })],
      flags: MessageFlags.Ephemeral,
    });
  } else {
    const toRemove = ALL_COLOR_ROLES
      .map(id => guild.roles.cache.get(id))
      .filter((r): r is Role => !!r && member.roles.cache.has(r.id));
    if (toRemove.length) await member.roles.remove(toRemove);
    await member.roles.add(newRole);
    await comp.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.SUCCESS).setTitle(`✅ Đã trang bị role: ${newRole.name}`).setFooter({ text: BOOSTER_FOOTER })],
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ── Tủ đồ Trang trí (Inventory cũ nhưng đã vá lỗi xuống dòng Heading Markdown) ──
async function showInventory(btn: MessageComponentInteraction, guild: import('discord.js').Guild): Promise<void> {
  const userId   = btn.user.id;
  const guildId  = btn.guildId!;
  const owned    = Profile.getOwned(userId, guildId);
  const settings = Profile.getSettings(userId, guildId);

  const member = guild.members.cache.get(userId)
    ?? await guild.members.fetch(userId).catch(() => null);
  const tier = member ? getUserTier(member) : 0;

  if (owned.length === 0 && tier === 0) {
    await btn.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.INFO).setDescription('Kho trống. Bấm **Shop** để xem và mua cosmetics!')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const equipped = new Set([
    settings.background_id, settings.frame_id, settings.title_id,
    settings.accent_id, settings.sticker_id, settings.name_style_id,
  ].filter(Boolean) as string[]);

  let desc = '';
  if (owned.length > 0) {
    const grouped = new Map<string, string[]>();
    for (const o of owned) {
      const item = Profile.getById(o.cosmetic_id);
      if (!item) continue;
      if (!grouped.has(item.type)) grouped.set(item.type, []);
      const eq     = equipped.has(o.cosmetic_id) ? ' ✅' : '';
      const expiry = o.expires_at ? ` · hết ${new Date(o.expires_at).toLocaleDateString('vi-VN')}` : '';
      grouped.get(item.type)!.push(` - ${RARITY_EMOJI[item.rarity]} **${item.name}**${eq}${expiry} · \`${item.id}\``);
    }
    for (const [type, lines] of grouped) {
      desc += `## ${TYPE_LABEL[type] ?? type}\n${lines.join('\n')}\n\n`;
    }
  } else {
    desc = '*Bạn chưa mua cosmetic nào từ Shop.*\n\n';
  }

  if (tier > 0) {
    const packInfo = tier >= 2 ? 'Color Pack - Booster Gốc & Booster I' : 'Color Pack - Booster Gốc';
    desc += `## 🎨 Role Màu\n - Đã mở **${packInfo}** — chọn màu từ menu bên dưới\n\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle('🎨 Tủ Đồ Trang Trí')
    .setDescription(desc.trim())
    .setThumbnail(btn.user.displayAvatarURL())
    .setFooter({ text: '✅ đang trang bị' });

  const rows: ActionRowBuilder<any>[] = [];

  if (owned.length > 0) {
    const equipOpts = owned
      .map(o => {
        const item = Profile.getById(o.cosmetic_id);
        if (!item) return null;
        return {
          label: `${item.name} ${equipped.has(o.cosmetic_id) ? '✅' : ''}`.trim(),
          value: o.cosmetic_id,
          description: `${TYPE_LABEL[item.type] ?? item.type} · ${item.rarity}`,
          emoji: RARITY_EMOJI[item.rarity],
        };
      })
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .slice(0, 25);

    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('inv_equip').setPlaceholder('Trang bị item...').addOptions(equipOpts),
    ));

    const unequipOpts: { label: string; value: string }[] = [];
    if (settings.background_id) unequipOpts.push({ label: `Tháo ${TYPE_LABEL.background}`, value: 'background' });
    if (settings.frame_id)      unequipOpts.push({ label: `Tháo ${TYPE_LABEL.frame}`,      value: 'frame' });
    if (settings.title_id)      unequipOpts.push({ label: `Tháo ${TYPE_LABEL.title}`,      value: 'title' });
    if (settings.accent_id)     unequipOpts.push({ label: `Tháo ${TYPE_LABEL.accent}`,     value: 'accent' });
    if (settings.sticker_id)    unequipOpts.push({ label: `Tháo ${TYPE_LABEL.sticker}`,    value: 'sticker' });

    if (unequipOpts.length > 0) {
      rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder().setCustomId('inv_unequip').setPlaceholder('Tháo cosmetic...').addOptions(unequipOpts),
      ));
    }
  }

  rows.push(...buildBoosterRows(tier));
  const finalRows = rows.slice(0, 5);

  await btn.reply({ embeds: [embed], components: finalRows, flags: MessageFlags.Ephemeral });

  if (finalRows.length === 0) return;

  const msg = await btn.fetchReply();
  const collector = msg.createMessageComponentCollector({ time: 300_000 });

  collector.on('collect', async comp => {
    if (comp.customId === 'inv_equip') {
      const sel    = comp as import('discord.js').StringSelectMenuInteraction;
      const result = Profile.equipCosmetic(userId, guildId, sel.values[0]);
      await comp.reply({
        embeds: [new EmbedBuilder()
          .setColor(result.success ? COLOR.SUCCESS : COLOR.DANGER)
          .setDescription(result.success ? `✅ Đã trang bị **${result.item?.name}**` : `❌ ${result.error}`)],
        flags: MessageFlags.Ephemeral,
      });
    } else if (comp.customId === 'inv_unequip') {
      const sel = comp as import('discord.js').StringSelectMenuInteraction;
      Profile.unequipSlot(userId, guildId, sel.values[0]);
      await comp.reply({
        embeds: [new EmbedBuilder().setColor(COLOR.INFO).setDescription(`🔲 Đã tháo ${TYPE_LABEL[sel.values[0]] ?? sel.values[0]}`)],
        flags: MessageFlags.Ephemeral,
      });
    } else if (comp.customId === 'booster_pack1' || comp.customId === 'booster_pack2') {
      const sel = comp as import('discord.js').StringSelectMenuInteraction;
      await applyColorRole(sel, guild, userId, sel.values[0]);
    } else if (comp.customId === 'booster_clear') {
      await applyColorRole(comp as MessageComponentInteraction, guild, userId, 'clear');
    }
  });

  collector.on('end', () => { btn.editReply({ components: [] }).catch(() => {}); });
}

// ── Kho Thẻ Bài Gacha Solo Leveling (Bê nguyên logic từ Gacha inventory cũ sang) ──
async function showCardInventory(btn: MessageComponentInteraction): Promise<void> {
  const userId = btn.user.id;
  const guildId = btn.guildId!;
  const inventory = Gacha.getInventory(userId, guildId);
  const total = Gacha.getTotalRolls(userId, guildId);

  if (inventory.length === 0) {
    await btn.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.INFO)
        .setTitle('🎒 Kho trống!')
        .setDescription('Bạn chưa sở hữu thẻ bài Solo Leveling nào.\n👉 Dùng lệnh `/gacha pack` để bắt đầu cày cuốc mở pack nhân vật nhé!')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const grouped: Record<string, string[]> = { SSR: [], SR: [], R: [], N: [] };
  for (const item of inventory) {
    const tag = item.count > 1 ? ` x${item.count}` : '';
    if (!grouped[item.item_rarity]) grouped[item.item_rarity] = [];
    grouped[item.item_rarity].push(`${item.item_emoji} ${item.item_name}${tag}`);
  }

  const RARITY_STARS: Record<string, string> = { SSR: '✨✨✨', SR: '⭐⭐', R: '⭐', N: '·' };

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle(`🃏 Kho Thẻ Bài Solo Leveling — ${btn.user.displayName}`)
    .setThumbnail(btn.user.displayAvatarURL())
    .setFooter({ text: `Tổng cộng ${total} lần roll gacha` });

  for (const rarity of ['SSR', 'SR', 'R', 'N']) {
    const items = grouped[rarity];
    if (items && items.length > 0) {
      embed.addFields({ name: `${rarity} ${RARITY_STARS[rarity]}`, value: items.join(', ') });
    }
  }

  await btn.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ── Achievements ───────────────────────────────────────────────────
async function showAchievements(btn: MessageComponentInteraction): Promise<void> {
  const all    = Achievement.getAllDefs();
  const earned = new Set(Achievement.getUserAchievements(btn.user.id, btn.guildId!).map(a => a.id));

  const lines = all.map(a => {
    const have = earned.has(a.id);
    return ` - ${have ? a.emoji : '🔒'} **${a.name}**${have ? '' : ' *(chưa mở)*'}\n   *${a.description}*`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle(`🏅 Achievements — ${btn.user.displayName}`)
    .setDescription(lines.join('\n'))
    .setThumbnail(btn.user.displayAvatarURL())
    .setFooter({ text: `${earned.size} / ${all.length} thành tích đã mở khóa` });

  await btn.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ── Preview helper ─────────────────────────────────────────────────
async function previewCosmetic(
  comp: import('discord.js').StringSelectMenuInteraction,
  guildId: string,
): Promise<void> {
  await comp.deferReply({ flags: MessageFlags.Ephemeral });

  const itemId       = comp.values[0];
  const item         = Profile.getById(itemId);
  if (!item) {
    await comp.editReply({ embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('❌ Item không tồn tại.')] });
    return;
  }

  const userId       = comp.user.id;
  const eco          = Eco.getOrCreate(userId, guildId);
  const settings     = Profile.getSettings(userId, guildId);
  const alreadyOwned = Profile.getOwned(userId, guildId).some(o => o.cosmetic_id === itemId);

  const embed = new EmbedBuilder()
    .setColor(RARITY_COLORS[item.rarity] ?? COLOR.INFO)
    .setTitle(item.name)
    .setDescription(item.description + (alreadyOwned ? '\n\n✅ Đã sở hữu' : ''))
    .addFields(
      { name: 'Độ hiếm', value: `${RARITY_EMOJI[item.rarity]} ${item.rarity}`, inline: true },
      { name: 'Loại',    value: TYPE_LABEL[item.type] ?? item.type,            inline: true },
      { name: 'Giá',     value: `${formatCoins(item.price)} coins`,            inline: true },
      { name: 'Ví bạn',  value: `${formatCoins(eco.balance)} coins`,           inline: true },
    );

  const files: AttachmentBuilder[] = [];

  if (['background', 'frame', 'accent'].includes(item.type)) {
    try {
      const streakRow = db.prepare(
        'SELECT streak FROM challenge_log WHERE user_id = ? AND guild_id = ? AND completed = 1 ORDER BY challenge_date DESC LIMIT 1'
      ).get(userId, guildId) as { streak: number } | undefined;

      const bestCard = db.prepare(
        `SELECT item_rarity, item_name FROM gacha_inventory WHERE user_id = ? AND guild_id = ?
         ORDER BY CASE item_rarity WHEN 'SSR' THEN 0 WHEN 'SR' THEN 1 WHEN 'R' THEN 2 ELSE 3 END LIMIT 1`
      ).get(userId, guildId) as { item_rarity: string; item_name: string } | undefined;

      const { buffer: buf, filename: previewFile } = await renderProfileCard({
        username:     comp.user.displayName,
        avatarUrl:    comp.user.displayAvatarURL({ size: 256, extension: 'png' }),
        title:        null,
        backgroundId: item.type === 'background' ? item.id : settings.background_id,
        frameId:      item.type === 'frame'      ? item.id : settings.frame_id,
        accentId:     item.type === 'accent'     ? item.id : settings.accent_id,
        coins:        eco.balance,
        streak:       streakRow?.streak ?? 0,
        totalRolls:   Gacha.getTotalRolls(userId, guildId),
        bestCard:     bestCard ? `${bestCard.item_name} (${bestCard.item_rarity})` : null,
        badges:       Achievement.getUserAchievements(userId, guildId),
      });

      files.push(new AttachmentBuilder(buf, { name: previewFile }));
      embed.setImage(`attachment://${previewFile}`);
    } catch {
      embed.setFooter({ text: '⚠️ Không thể render preview hình ảnh' });
    }
  }

  if (alreadyOwned) {
    await comp.editReply({ embeds: [embed], files });
    return;
  }

  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_buy_${itemId}`)
      .setLabel('Mua ngay')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('preview_cancel')
      .setLabel('Hủy')
      .setStyle(ButtonStyle.Secondary),
  );

  await comp.editReply({ embeds: [embed], components: [btnRow], files });

  const previewMsg  = await comp.fetchReply();
  const btnCollector = previewMsg.createMessageComponentCollector({ time: 60_000 });

  btnCollector.on('collect', async btn => {
    btnCollector.stop();

    if (btn.customId === 'preview_cancel') {
      await btn.update({ embeds: [new EmbedBuilder().setColor(COLOR.INFO).setDescription('Đã hủy.')], components: [], files: [] });
      return;
    }

    const result = Profile.buyCosmetic(btn.user.id, guildId, itemId);
    if (!result.success) {
      await btn.update({ embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription(`❌ ${result.error}`)], components: [], files: [] });
      return;
    }

    const updatedEco = Eco.getOrCreate(btn.user.id, guildId);
    await btn.update({
      embeds: [new EmbedBuilder()
        .setColor(RARITY_COLORS[item.rarity] ?? COLOR.SUCCESS)
        .setTitle(`✅ Đã mua: ${item.name}`)
        .setDescription(item.description)
        .addFields(
          { name: 'Loại',     value: TYPE_LABEL[item.type] ?? item.type,        inline: true },
          { name: 'Còn lại',  value: `${formatCoins(updatedEco.balance)} coins`, inline: true },
        )
        .setFooter({ text: `Vào Tủ Đồ Trang Trí để trang bị` })],
      components: [],
      files: [],
    });
  });

  btnCollector.on('end', (_, reason) => {
    if (reason === 'time') comp.editReply({ components: [] }).catch(() => {});
  });
}

// ── Shop ───────────────────────────────────────────────────────────
async function showShop(btn: MessageComponentInteraction, _guild: import('discord.js').Guild): Promise<void> {
  const userId  = btn.user.id;
  const guildId = btn.guildId!;
  const eco     = Eco.getOrCreate(userId, guildId);
  const items   = Profile.getCatalog();
  const owned   = new Set(Profile.getOwned(userId, guildId).map(o => o.cosmetic_id));

  const RARITY_ORDER: Record<string, number> = { N: 0, R: 1, SR: 2, SSR: 3 };
  const sorted = [...items].sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.price - b.price);

  const grouped = new Map<string, string[]>();
  for (const item of sorted) {
    if (!grouped.has(item.type)) grouped.set(item.type, []);
    const have  = owned.has(item.id) ? ' ✅' : '';
    const price = eco.balance >= item.price ? `${formatCoins(item.price)} coins` : `~~${formatCoins(item.price)} coins~~`;
    grouped.get(item.type)!.push(` - ${RARITY_EMOJI[item.rarity]} **${item.name}**${have} — ${price}`);
  }

  let shopDesc = `Ví: **${formatCoins(eco.balance)} coins**\n\n`;
  for (const [type, lines] of grouped) {
    shopDesc += `## ${TYPE_LABEL[type] ?? type}\n${lines.join('\n')}\n\n`;
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle('🛍️ Profile Cosmetic Shop')
    .setDescription(shopDesc.trim())
    .setThumbnail(btn.client.user?.displayAvatarURL() ?? null)
    .setFooter({ text: '✅ đã sở hữu · Chọn item để xem trước' });

  const previewable = sorted.slice(0, 25);
  if (previewable.length === 0) {
    await btn.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('shop_preview')
    .setPlaceholder('🔍 Chọn item để xem trước...')
    .addOptions(previewable.map(item => ({
      label: `${owned.has(item.id) ? '✅ ' : ''}${item.name} — ${formatCoins(item.price)} coins`,
      value: item.id,
      description: `${item.rarity} · ${TYPE_LABEL[item.type] ?? item.type}`,
      emoji: RARITY_EMOJI[item.rarity],
    })));

  await btn.reply({ embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)], flags: MessageFlags.Ephemeral });
  const msg = await btn.fetchReply();

  const collector = msg.createMessageComponentCollector({ time: 120_000 });
  collector.on('collect', async comp => {
    if (comp.customId !== 'shop_preview') return;
    await previewCosmetic(comp as import('discord.js').StringSelectMenuInteraction, guildId);
  });
  collector.on('end', () => { btn.editReply({ components: [] }).catch(() => {}); });
}