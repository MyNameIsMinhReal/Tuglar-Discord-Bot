import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, User, AttachmentBuilder,
  StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  GuildMember, Role, MessageComponentInteraction,
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

// ── Booster Color Packs ────────────────────────────────────────────
const COLOR_PACK_1 = [
  { label: 'Sky',    value: '1162545019123666984', emoji: { id: '1509998906723799191', name: 'IC_Sky' } },
  { label: 'Carrot', value: '1157296480722366555', emoji: { id: '1510003170661892399', name: 'IC_Carrot' } },
  { label: 'Rose',   value: '1157297666879926304', emoji: { id: '1510003959652155556', name: 'IC_Rose' } },
  { label: 'Purple', value: '1157298499461840906', emoji: { id: '1510004463362900229', name: 'IC_Purple' } },
  { label: 'Peachy', value: '1157298054764974130', emoji: { id: '1509997745916612768', name: 'IC_Peachy' } },
];

const COLOR_PACK_2 = [
  { label: 'Mint',        value: '1164764867769667664', emoji: { id: '1510016060982558731', name: 'IC_Mint' } },
  { label: 'xLemon',      value: '1164766440335876126', emoji: { id: '1510016065122336929', name: 'IC_xLemon' } },
  { label: '1stHeart',    value: '1510012176876699768', emoji: { id: '1510016047896334536', name: 'IC_1stHeart' } },
  { label: 'Cyber-20xx',  value: '1164946570920337538', emoji: { id: '1510016058613043230', name: 'IC_Cyber20xx' } },
  { label: 'TraDaoCamSa', value: '1164946156858650635', emoji: { id: '1510016063125852410', name: 'IC_TraDaoCamSa' } },
];

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
  }
}

// ── View ───────────────────────────────────────────────────────────
async function handleView(i: ChatInputCommandInteraction): Promise<void> {
  await i.deferReply();

  const target: User = i.options.getUser('user') ?? i.user;
  const guildId = i.guildId!;

  const eco      = Eco.getOrCreate(target.id, guildId);
  const settings = Profile.getSettings(target.id, guildId);
  const badges   = Achievement.getUserAchievements(target.id, guildId);
  const total    = Gacha.getTotalRolls(target.id, guildId);

  // Equipped items
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

  // Try canvas card — attach as image if successful, fallback to thumbnail
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
    await i.editReply({ embeds: [embed], files: [attachment] });
  } catch {
    embed.setThumbnail(target.displayAvatarURL({ size: 256 }));
    await i.editReply({ embeds: [embed] });
  }
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

// ── Booster Role Helpers ───────────────────────────────────────────
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
    await comp.reply({ embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('❌ Không tìm thấy member.')], ephemeral: true });
    return;
  }

  if (selectedValue === 'clear' || selectedValue === '0') {
    const toRemove = ALL_COLOR_ROLES
      .map(id => guild.roles.cache.get(id))
      .filter((r): r is Role => !!r && member.roles.cache.has(r.id));
    if (toRemove.length) await member.roles.remove(toRemove);
    await comp.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('🗑️・Đã thu hồi role thành công!').setFooter({ text: BOOSTER_FOOTER })],
      ephemeral: true,
    });
    return;
  }

  const newRole = guild.roles.cache.get(selectedValue);
  if (!newRole) {
    await comp.reply({ embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('❌ Role không tồn tại.')], ephemeral: true });
    return;
  }

  if (member.roles.cache.has(selectedValue)) {
    await member.roles.remove(newRole);
    await comp.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setTitle(`Đã gỡ bỏ role: ${newRole.name}`).setFooter({ text: BOOSTER_FOOTER })],
      ephemeral: true,
    });
  } else {
    const toRemove = ALL_COLOR_ROLES
      .map(id => guild.roles.cache.get(id))
      .filter((r): r is Role => !!r && member.roles.cache.has(r.id));
    if (toRemove.length) await member.roles.remove(toRemove);
    await member.roles.add(newRole);
    await comp.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.SUCCESS).setTitle(`✅ Đã trang bị role: ${newRole.name}`).setFooter({ text: BOOSTER_FOOTER })],
      ephemeral: true,
    });
  }
}

// ── Inventory ──────────────────────────────────────────────────────
async function handleInventory(i: ChatInputCommandInteraction): Promise<void> {
  const guild    = i.guild!;
  const owned    = Profile.getOwned(i.user.id, i.guildId!);
  const settings = Profile.getSettings(i.user.id, i.guildId!);

  const member = guild.members.cache.get(i.user.id)
    ?? await guild.members.fetch(i.user.id).catch(() => null);
  const tier = member ? getUserTier(member) : 0;
  const boosterRows = buildBoosterRows(tier);

  if (owned.length === 0 && tier === 0) {
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

  const embed = new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setTitle(`🗄️ Kho cosmetic — ${i.user.displayName}`)
    .setFooter({ text: '✅ đang trang bị · /profile equip <id>' });

  if (owned.length > 0) {
    const grouped = new Map<string, string[]>();
    for (const o of owned) {
      const item = Profile.getById(o.cosmetic_id);
      if (!item) continue;
      if (!grouped.has(item.type)) grouped.set(item.type, []);
      const eq     = equipped.has(o.cosmetic_id) ? ' ✅' : '';
      const expiry = o.expires_at ? ` · hết ${new Date(o.expires_at).toLocaleDateString('vi-VN')}` : '';
      grouped.get(item.type)!.push(`${RARITY_EMOJI[item.rarity]} **${item.name}**${eq}${expiry} · \`${item.id}\``);
    }
    for (const [type, lines] of grouped) {
      embed.addFields({ name: TYPE_LABEL[type] ?? type, value: lines.join('\n') });
    }
  } else {
    embed.setDescription('*Chưa có cosmetic nào. Dùng `/profile shop` để mua!*');
  }

  if (tier > 0) {
    embed.addFields({
      name: '🎨 Role Màu Booster',
      value: tier >= 2
        ? 'Đã mở **Color Pack - Booster Gốc** và **Color Pack - Booster I**. Chọn màu từ menu bên dưới.'
        : 'Đã mở **Color Pack - Booster Gốc**. Chọn màu từ menu bên dưới.',
    });
  }

  await i.reply({ embeds: [embed], components: boosterRows, ephemeral: true });

  if (boosterRows.length === 0) return;

  const msg = await i.fetchReply();
  const collector = msg.createMessageComponentCollector({ time: 300_000 });

  collector.on('collect', async comp => {
    if (comp.customId === 'booster_pack1' || comp.customId === 'booster_pack2') {
      const sel = comp as import('discord.js').StringSelectMenuInteraction;
      await applyColorRole(sel, guild, i.user.id, sel.values[0]);
    } else if (comp.customId === 'booster_clear') {
      await applyColorRole(comp as MessageComponentInteraction, guild, i.user.id, 'clear');
    }
  });

  collector.on('end', () => {
    i.editReply({ components: [] }).catch(() => {});
  });
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

// ── Preview helper ─────────────────────────────────────────────────
async function previewCosmetic(
  comp: import('discord.js').StringSelectMenuInteraction,
  guildId: string,
): Promise<void> {
  await comp.deferReply({ ephemeral: true });

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
        .setTitle(`✅ ${item.name}`)
        .setDescription(item.description)
        .addFields(
          { name: 'Loại',     value: TYPE_LABEL[item.type] ?? item.type,        inline: true },
          { name: 'Còn lại',  value: `${formatCoins(updatedEco.balance)} coins`, inline: true },
        )
        .setFooter({ text: `/profile equip item:${item.id}` })],
      components: [],
      files: [],
    });
  });

  btnCollector.on('end', (_, reason) => {
    if (reason === 'time') comp.editReply({ components: [] }).catch(() => {});
  });
}

// ── Shop (+ preview & buy) ─────────────────────────────────────────
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
    const have   = owned.has(item.id) ? ' ✅' : '';
    const afford = eco.balance >= item.price ? '' : ' ~~' + formatCoins(item.price) + '~~';
    grouped.get(item.type)!.push(
      `${RARITY_EMOJI[item.rarity]} **${item.name}**${have} — ${afford || formatCoins(item.price) + ' coins'}`
    );
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle('🛍️ Profile Cosmetic Shop')
    .setDescription(`Ví: **${formatCoins(eco.balance)} coins**`)
    .setFooter({ text: '✅ đã sở hữu · Chọn item để xem trước' });

  for (const [type, lines] of grouped) {
    embed.addFields({ name: TYPE_LABEL[type] ?? type, value: lines.join('\n') });
  }

  // All items in select for preview (cap at 25)
  const previewable = sorted.slice(0, 25);
  if (previewable.length === 0) {
    await i.reply({ embeds: [embed] });
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('shop_preview')
    .setPlaceholder('🔍 Chọn item để xem trước...')
    .addOptions(
      previewable.map(item => ({
        label: `${owned.has(item.id) ? '✅ ' : ''}${item.name} — ${formatCoins(item.price)} coins`,
        value: item.id,
        description: `${item.rarity} · ${TYPE_LABEL[item.type] ?? item.type}`,
        emoji: RARITY_EMOJI[item.rarity],
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  await i.reply({ embeds: [embed], components: [row] });
  const msg = await i.fetchReply();

  const collector = msg.createMessageComponentCollector({ time: 120_000 });

  collector.on('collect', async comp => {
    if (comp.customId !== 'shop_preview') return;
    await previewCosmetic(comp as import('discord.js').StringSelectMenuInteraction, i.guildId!);
  });

  collector.on('end', () => {
    i.editReply({ components: [] }).catch(() => {});
  });
}
