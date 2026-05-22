import path from 'node:path';
import fs from 'node:fs';
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  AttachmentBuilder, Message,
} from 'discord.js';
import * as Gacha from '../services/GachaService';
import * as Eco from '../services/EconomyService';
import { COLOR, RARITY_COLORS, RARITY_STARS } from '../utils/embeds';
import { formatCoins } from '../utils/helpers';
import { GachaItem } from '../types';

const ROLL_COST = 100;
const PACK_SIZE = 5;
const PACK_COST = 450; // 5 cards with ~10% discount + guaranteed R+

// ── Command Definition ─────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('gacha')
  .setDescription('Roll nhân vật Solo Leveling')
  .addSubcommand(sub => sub.setName('roll').setDescription(`Roll 1 lần (${ROLL_COST} coins)`))
  .addSubcommand(sub => sub.setName('roll10').setDescription(`Roll 10 lần (${ROLL_COST * 9} coins)`))
  .addSubcommand(sub => sub.setName('pack').setDescription(`Mở pack 5 lá (${PACK_COST} coins — guaranteed R+)`))
  .addSubcommand(sub => sub.setName('inventory').setDescription('Xem kho của bạn'))
  .addSubcommand(sub => sub.setName('pool').setDescription('Xem tỷ lệ các nhân vật'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'roll':      return handleRoll(interaction, 1);
    case 'roll10':    return handleRoll(interaction, 10);
    case 'pack':      return handlePack(interaction);
    case 'inventory': return handleInventory(interaction);
    case 'pool':      return handlePool(interaction);
  }
}

// ── Image Helper ───────────────────────────────────────────────────
const CARD_DIR  = path.join(process.cwd(), 'data', 'cards');
const CARD_EXTS = ['.png', '.jpg', '.gif', '.webp'];

function getCardFile(itemId: string): { attachment: AttachmentBuilder; filename: string } | null {
  for (const ext of CARD_EXTS) {
    const filePath = path.join(CARD_DIR, itemId + ext);
    if (fs.existsSync(filePath)) {
      const filename = itemId + ext;
      return { attachment: new AttachmentBuilder(filePath, { name: filename }), filename };
    }
  }
  return null;
}

function cardId(item: GachaItem): string {
  return item.image ? item.image.replace(/\.[^.]+$/, '') : item.id;
}

// ── Button Wait Helper ─────────────────────────────────────────────
async function waitForButton(msg: Message, userId: string, customId: string, ms = 120_000): Promise<boolean> {
  try {
    const btn = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: b => b.user.id === userId && b.customId === customId,
      time: ms,
    });
    await btn.deferUpdate();
    return true;
  } catch {
    return false;
  }
}

// ── Roll (1 or 10) ─────────────────────────────────────────────────
async function handleRoll(i: ChatInputCommandInteraction, count: number): Promise<void> {
  const cost = count === 10 ? ROLL_COST * 9 : ROLL_COST * count;
  const user = Eco.getOrCreate(i.user.id, i.guildId);

  if (user.balance < cost) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.DANGER)
        .setTitle('❌ Không đủ coins!')
        .addFields(
          { name: '💸 Cần', value: `${formatCoins(cost)} coins`, inline: true },
          { name: '👛 Bạn có', value: `${formatCoins(user.balance)} coins`, inline: true },
        )
        .setFooter({ text: 'Dùng /eco daily để kiếm thêm nha' })],
      ephemeral: true,
    });
    return;
  }

  Eco.deductCoins(i.user.id, i.guildId, cost);

  if (count === 1) {
    const item = Gacha.rollGacha();
    Gacha.saveToInventory(i.user.id, i.guildId, item);
    const total = Gacha.getTotalRolls(i.user.id, i.guildId);

    const rarityMsg: Record<string, string> = {
      SSR: 'WOAH SSR!! 🎉🎉🎉', SR: 'SR rồi, không tệ!',
      R: 'R, về kho nhé',      N: 'N... may mắn lần sau',
    };

    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(RARITY_COLORS[item.rarity] ?? 0x9E9E9E)
        .setTitle(`${item.emoji} ${item.name}`)
        .setDescription(`## ${item.rarity} ${RARITY_STARS[item.rarity]}\n\n${item.description}\n\n${rarityMsg[item.rarity]}`)
        .setFooter({ text: `Roll lần ${total} · Tốn ${formatCoins(cost)} coins` })],
    });
    return;
  }

  const results = Array.from({ length: count }, () => {
    const item = Gacha.rollGacha();
    Gacha.saveToInventory(i.user.id, i.guildId, item);
    return item;
  });

  const order: Record<string, number> = { SSR: 0, SR: 1, R: 2, N: 3 };
  const best     = results.reduce((a, b) => order[a.rarity] < order[b.rarity] ? a : b, results[0]);
  const lines    = results.map(item => `${item.emoji} **${item.name}** — ${item.rarity} ${RARITY_STARS[item.rarity]}`);
  const ssrCount = results.filter(r => r.rarity === 'SSR').length;
  const srCount  = results.filter(r => r.rarity === 'SR').length;

  let highlight = `\nTốt nhất: **${best.emoji} ${best.name}** (${best.rarity})`;
  if (ssrCount > 0) highlight = `\n🎉 **${ssrCount} SSR trong lần này!!**`;
  else if (srCount > 0) highlight = `\n⭐ SR rồi, không tệ!`;

  let color = COLOR.INFO;
  if (ssrCount > 0) color = RARITY_COLORS.SSR;
  else if (srCount > 0) color = RARITY_COLORS.SR;
  const remaining = Eco.getOrCreate(i.user.id, i.guildId).balance;

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(color)
      .setTitle(`🎰 Roll x${count} — Kết quả`)
      .setDescription(lines.join('\n') + highlight)
      .setFooter({ text: `Tốn ${formatCoins(cost)} coins · Còn lại ${formatCoins(remaining)} coins` })],
  });
}

// ── Pack Embeds ────────────────────────────────────────────────────
function sealedPackEmbed(cost: number, size: number): EmbedBuilder {
  const cover = getCardFile('pack_cover');
  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('🎴  Pack Chưa Mở')
    .setDescription(`**${size} lá bài** đang chờ bên trong...\nMỗi pack đảm bảo ít nhất **1 lá R trở lên**!\n\n*Đã trừ ${formatCoins(cost)} coins*`)
    .setFooter({ text: 'Nhấn nút để mở pack!' });
  if (cover) embed.setImage(`attachment://${cover.filename}`);
  return embed;
}

function suspenseEmbed(rarity: 'SSR' | 'SR'): EmbedBuilder {
  if (rarity === 'SSR') {
    return new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle('✨  Ánh sáng chói lóa...')
      .setDescription('# ✨ ✨ ✨\nCó gì đó **cực kỳ hiếm** đang xuất hiện!\n\n*Bạn có dám lật không?*');
  }
  return new EmbedBuilder()
    .setColor(0xC0C0C0)
    .setTitle('⭐  Ánh bạc lấp lánh...')
    .setDescription('# ⭐ ⭐\nMột thứ **đặc biệt** đang ẩn sau tấm bài...\n\n*Lật bài nào!*');
}

function cardRevealEmbed(item: GachaItem, cardNum: number, total: number, filename: string | null): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(RARITY_COLORS[item.rarity] ?? 0x9E9E9E)
    .setTitle(`${item.emoji}  ${item.name}`)
    .setDescription(`## ${item.rarity} ${RARITY_STARS[item.rarity]}\n\n${item.description}`)
    .setFooter({ text: `Lá ${cardNum} / ${total}` });
  if (filename) embed.setImage(`attachment://${filename}`);
  return embed;
}

function packSummaryEmbed(items: GachaItem[], remainingCoins: number): EmbedBuilder {
  const order: Record<string, number> = { SSR: 0, SR: 1, R: 2, N: 3 };
  const sorted   = [...items].sort((a, b) => order[a.rarity] - order[b.rarity]);
  const ssrCount = items.filter(it => it.rarity === 'SSR').length;
  const srCount  = items.filter(it => it.rarity === 'SR').length;

  const lines = sorted.map(it => `${it.emoji} **${it.name}** — ${it.rarity} ${RARITY_STARS[it.rarity]}`);

  let highlight = '';
  if (ssrCount > 0)      highlight = `\n\n🎉 **${ssrCount} SSR trong pack này!!**`;
  else if (srCount > 0)  highlight = `\n\n⭐ **${srCount} SR — không tệ!**`;

  let color: number;
  if (ssrCount > 0)     color = 0xFFD700;
  else if (srCount > 0) color = 0xC0C0C0;
  else                  color = COLOR.INFO;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🎴  Pack đã mở xong!')
    .setDescription(lines.join('\n') + highlight)
    .setFooter({ text: `Còn lại: ${formatCoins(remainingCoins)} coins` });
}

// Button row builders
const rowOpen   = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('pack_open').setLabel('✂️  Mở Pack!').setStyle(ButtonStyle.Success),
);
const rowReveal = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('pack_reveal').setLabel('✨  Lật Bài!').setStyle(ButtonStyle.Danger),
);
const rowNext   = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('pack_next').setLabel('➡️  Lá tiếp theo').setStyle(ButtonStyle.Primary),
);

// ── Pack Opening ───────────────────────────────────────────────────
async function handlePack(i: ChatInputCommandInteraction): Promise<void> {
  const user = Eco.getOrCreate(i.user.id, i.guildId);
  if (user.balance < PACK_COST) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.DANGER)
        .setDescription(`Không đủ coins! Cần **${formatCoins(PACK_COST)} coins**, bạn có **${formatCoins(user.balance)}**.\nDùng \`/eco daily\` để kiếm thêm nha.`)],
      ephemeral: true,
    });
    return;
  }

  Eco.deductCoins(i.user.id, i.guildId, PACK_COST);
  const items = Gacha.rollPack(PACK_SIZE);

  const cover = getCardFile('pack_cover');
  await i.reply({
    embeds: [sealedPackEmbed(PACK_COST, PACK_SIZE)],
    files: cover ? [cover.attachment] : [],
    components: [rowOpen()],
  });

  const msg = await i.fetchReply();

  if (!await waitForButton(msg as Message, i.user.id, 'pack_open', 90_000)) {
    items.forEach(it => Gacha.saveToInventory(i.user.id, i.guildId, it));
    await i.editReply({
      embeds: [new EmbedBuilder().setColor(COLOR.DANGER).setDescription('⏰ Pack hết hạn — nhân vật đã được lưu vào kho.')],
      files: [], components: [],
    });
    return;
  }

  await revealCards(i, msg as Message, items);
}

async function revealCards(
  i: ChatInputCommandInteraction, msg: Message, items: GachaItem[],
): Promise<void> {
  for (let idx = 0; idx < items.length; idx++) {
    const item   = items[idx];
    const isLast = idx === items.length - 1;

    if (item.rarity === 'SSR' || item.rarity === 'SR') {
      await i.editReply({ embeds: [suspenseEmbed(item.rarity)], files: [], components: [rowReveal()] });
      if (!await waitForButton(msg, i.user.id, 'pack_reveal')) {
        items.slice(idx).forEach(it => Gacha.saveToInventory(i.user.id, i.guildId, it));
        await i.editReply({ components: [] });
        return;
      }
    }

    const cf = getCardFile(cardId(item));
    await i.editReply({
      embeds: [cardRevealEmbed(item, idx + 1, items.length, cf?.filename ?? null)],
      files: cf ? [cf.attachment] : [],
      components: isLast ? [] : [rowNext()],
    });
    Gacha.saveToInventory(i.user.id, i.guildId, item);

    if (!isLast && !await waitForButton(msg, i.user.id, 'pack_next')) {
      items.slice(idx + 1).forEach(it => Gacha.saveToInventory(i.user.id, i.guildId, it));
      await i.editReply({ components: [] });
      return;
    }
  }

  await new Promise<void>(r => setTimeout(r, 600));
  await i.editReply({
    embeds: [packSummaryEmbed(items, Eco.getOrCreate(i.user.id, i.guildId).balance)],
    files: [], components: [],
  });
}

// ── Inventory ──────────────────────────────────────────────────────
async function handleInventory(i: ChatInputCommandInteraction): Promise<void> {
  const inventory = Gacha.getInventory(i.user.id, i.guildId);
  const total     = Gacha.getTotalRolls(i.user.id, i.guildId);

  if (inventory.length === 0) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.INFO)
        .setTitle('🎒 Kho trống!')
        .setDescription('Dùng `/gacha roll` hoặc `/gacha pack` để bắt đầu 🎰')],
    });
    return;
  }

  const grouped: Record<string, string[]> = { SSR: [], SR: [], R: [], N: [] };
  for (const item of inventory) {
    const tag = item.count > 1 ? ` x${item.count}` : '';
    if (!grouped[item.item_rarity]) grouped[item.item_rarity] = [];
    grouped[item.item_rarity].push(`${item.item_emoji} ${item.item_name}${tag}`);
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle(`🎒 Kho của ${i.user.displayName}`)
    .setThumbnail(i.user.displayAvatarURL())
    .setFooter({ text: `Tổng ${total} lần roll` });

  for (const rarity of ['SSR', 'SR', 'R', 'N']) {
    const items = grouped[rarity];
    if (items && items.length > 0) {
      embed.addFields({ name: `${rarity} ${RARITY_STARS[rarity]}`, value: items.join(', ') });
    }
  }

  await i.reply({ embeds: [embed] });
}

// ── Pool ───────────────────────────────────────────────────────────
async function handlePool(i: ChatInputCommandInteraction): Promise<void> {
  const pool    = Gacha.getPool();
  const grouped: Record<string, typeof pool> = {};
  for (const item of pool) {
    if (!grouped[item.rarity]) grouped[item.rarity] = [];
    grouped[item.rarity].push(item);
  }

  const lines = Object.entries(grouped).map(([rarity, items]) => {
    const total = items.reduce((s, it) => s + it.rate, 0).toFixed(1);
    const names = items.map(it => `${it.emoji} ${it.name} (${it.rate}%)`).join(', ');
    return `**${rarity}** (tổng ${total}%): ${names}`;
  });

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.INFO)
      .setTitle('🎴 Tỷ lệ Gacha')
      .setDescription(lines.join('\n'))
      .addFields({
        name: '💰 Chi phí',
        value: `1 roll = **${ROLL_COST} coins** | 10 roll = **${ROLL_COST * 9} coins** | Pack 5 lá = **${PACK_COST} coins** (guaranteed R+)`,
      })],
  });
}
