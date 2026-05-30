import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import * as Eco from '../services/EconomyService';
import { COLOR, errorEmbed } from '../utils/embeds';
import { formatCoins } from '../utils/helpers';
import path from 'path';
import fs from 'fs';
import { ShopItem } from '../types';
import { db } from '../database';
import { cfg } from '../config';

let shopItems: ShopItem[] = [];
try {
  shopItems = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'shop_items.json'), 'utf-8'));
} catch {}

export const data = new SlashCommandBuilder()
  .setName('eco')
  .setDescription('Hệ thống coins')
  .addSubcommand(sub => sub.setName('daily').setDescription('Nhận coins hàng ngày'))
  .addSubcommand(sub => sub.setName('balance').setDescription('Xem số dư'))
  .addSubcommand(sub => sub
    .setName('leaderboard')
    .setDescription('Bảng xếp hạng')
    .addStringOption(o => o
      .setName('type')
      .setDescription('Loại xếp hạng')
      .setRequired(false)
      .addChoices(
        { name: 'Giàu nhất (số dư hiện tại)', value: 'balance' },
        { name: 'Kiếm nhiều nhất (tổng all-time)', value: 'earned' },
      )
    )
  )
  .addSubcommand(sub => sub.setName('shop').setDescription('Xem shop'))
  .addSubcommand(sub => sub
    .setName('buy')
    .setDescription('Mua đồ')
    .addStringOption(o => o.setName('item_id').setDescription('ID vật phẩm').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('pay')
    .setDescription('Chuyển coins (5% phí, tối đa 500 coins/ngày)')
    .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Số coins').setRequired(true).setMinValue(1))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case 'daily':       return handleDaily(interaction);
    case 'balance':     return handleBalance(interaction);
    case 'leaderboard': return handleLeaderboard(interaction);
    case 'shop':        return handleShop(interaction);
    case 'buy':         return handleBuy(interaction);
    case 'pay':         return handlePay(interaction);
  }
}

async function handleDaily(i: ChatInputCommandInteraction): Promise<void> {
  const { canClaim, hoursLeft } = Eco.canClaimDaily(i.user.id, i.guildId!);
  if (!canClaim) {
    const h = Math.floor(hoursLeft);
    const m = Math.floor((hoursLeft - h) * 60);
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.WARNING)
        .setTitle('⏳ Chưa đến giờ!')
        .setDescription(`Còn **${h}h ${m}m** nữa mới được nhận tiếp nhé.`)],
      ephemeral: true,
    });
    return;
  }

  const reward = Eco.claimDaily(i.user.id, i.guildId!);
  const user   = Eco.getOrCreate(i.user.id, i.guildId!);

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.ECONOMY)
      .setTitle('💰 Điểm danh hàng ngày!')
      .addFields(
        { name: '🎁 Nhận được', value: `**+${formatCoins(reward)} coins**`, inline: true },
        { name: '👛 Số dư hiện tại', value: `**${formatCoins(user.balance)} coins**`, inline: true },
      )
      .setFooter({ text: 'Quay lại ngày mai để nhận tiếp!' })
      .setTimestamp()],
  });
}

async function handleBalance(i: ChatInputCommandInteraction): Promise<void> {
  const user = Eco.getOrCreate(i.user.id, i.guildId!);
  const rank = (db.prepare(
    'SELECT COUNT(*) + 1 as rank FROM economy WHERE guild_id = ? AND balance > ?'
  ).get(i.guildId!, user.balance) as any).rank;

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.ECONOMY)
      .setTitle(`👛 Ví — ${i.user.displayName}`)
      .setThumbnail(i.user.displayAvatarURL())
      .addFields(
        { name: '💰 Số dư', value: `**${formatCoins(user.balance)} coins**`, inline: true },
        { name: '🏆 Hạng', value: `**#${rank}** trên server`, inline: true },
        { name: '📈 Tổng kiếm được', value: `${formatCoins(user.total_earned)} coins`, inline: true },
      )
      .setTimestamp()],
  });
}

async function handleLeaderboard(i: ChatInputCommandInteraction): Promise<void> {
  const type = i.options.getString('type') ?? 'balance';
  const top  = type === 'earned'
    ? Eco.getEarnedLeaderboard(i.guildId!, 10)
    : Eco.getLeaderboard(i.guildId!, 10);

  if (top.length === 0) {
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.INFO)
        .setDescription('Chưa có ai có coins hết 😅')],
    });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, idx) => {
    const me    = u.user_id === i.user.id ? ' **← bạn**' : '';
    const value = type === 'earned'
      ? `${formatCoins(u.total_earned)} earned`
      : `${formatCoins(u.balance)} coins`;
    return `${medals[idx] ?? `${idx + 1}.`} <@${u.user_id}> — **${value}**${me}`;
  });

  const title = type === 'earned'
    ? '📈 Top kiếm nhiều nhất (all-time)'
    : '🏆 Top giàu nhất server';

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.ECONOMY)
      .setTitle(title)
      .setDescription(lines.join('\n'))
      .setFooter({ text: type === 'balance' ? 'Tip: /eco leaderboard earned để xem tổng all-time' : 'Tip: /eco leaderboard balance để xem số dư' })
      .setTimestamp()],
  });
}

const CATEGORY_LABEL: Record<string, string> = {
  study:    '📚 Học Tập',
  gacha:    '🎲 Gacha & May Mắn',
  cosmetic: '🎨 Trang Trí',
};

async function handleShop(i: ChatInputCommandInteraction): Promise<void> {
  const user = Eco.getOrCreate(i.user.id, i.guildId!);

  const grouped = new Map<string, typeof shopItems>();
  for (const item of shopItems) {
    let list = grouped.get(item.category);
    if (!list) { list = []; grouped.set(item.category, list); }
    list.push(item);
  }

  let shopDesc = `Ví: **${formatCoins(user.balance)} coins**\n\n`;
  for (const [cat, items] of grouped) {
    shopDesc += `## ${CATEGORY_LABEL[cat] ?? cat}\n`;
    for (const it of items) {
      shopDesc += ` - ${it.emoji} **${it.name}** — ${formatCoins(it.price)} coins · \`${it.id}\`\n`;
      shopDesc += `   *${it.description}*\n`;
    }
    shopDesc += '\n';
  }

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle('🛒 Shop')
    .setDescription(shopDesc.trim())
    .setThumbnail(i.client.user?.displayAvatarURL() ?? null)
    .setFooter({ text: '/eco buy <id> để mua · Role/huy hiệu: liên hệ admin sau khi mua' });

  await i.reply({ embeds: [embed] });
}

async function handleBuy(i: ChatInputCommandInteraction): Promise<void> {
  const itemId = i.options.getString('item_id', true);
  const item = shopItems.find(s => s.id === itemId);
  if (!item) {
    await i.reply({ embeds: [errorEmbed(`Không tìm thấy item \`${itemId}\`.`)], ephemeral: true });
    return;
  }

  const success = Eco.deductCoins(i.user.id, i.guildId!, item.price);
  if (!success) {
    const user = Eco.getOrCreate(i.user.id, i.guildId!);
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.DANGER)
        .setTitle('❌ Không đủ coins!')
        .addFields(
          { name: '💸 Cần', value: `${formatCoins(item.price)} coins`, inline: true },
          { name: '👛 Bạn có', value: `${formatCoins(user.balance)} coins`, inline: true },
        )],
      ephemeral: true,
    });
    return;
  }

  db.prepare(
    'INSERT INTO shop_purchases (user_id, guild_id, item_id, item_name, price) VALUES (?, ?, ?, ?, ?)'
  ).run(i.user.id, i.guildId!, item.id, item.name, item.price);

  const isCosmetic = item.category === 'cosmetic';
  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('🛍️ Mua thành công!')
      .setDescription(`${item.emoji} **${item.name}**\n${item.description}`)
      .setFooter({ text: isCosmetic ? 'Liên hệ admin để nhận role/huy hiệu nha' : 'Sử dụng ngay trong các lệnh liên quan!' })],
  });
}

const DAILY_TRANSFER_LIMIT = cfg.dailyTransferLimit;
const TRANSFER_TAX_RATE    = cfg.payTaxPercent / 100;
const MIN_MEMBER_DAYS      = cfg.minMemberDays;

async function handlePay(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser('user', true);
  const amount = i.options.getInteger('amount', true);

  if (target.id === i.user.id) {
    await i.reply({ embeds: [errorEmbed('Không thể tự chuyển cho mình 😄')], ephemeral: true });
    return;
  }
  if (target.bot) {
    await i.reply({ embeds: [errorEmbed('Bot không nhận tiền đâu bạn ơi.')], ephemeral: true });
    return;
  }

  // Yêu cầu ở server ít nhất 3 ngày — chống alt-farm
  const senderMember = i.member as GuildMember | null;
  if (senderMember?.joinedAt) {
    const daysSinceJoin = (Date.now() - senderMember.joinedAt.getTime()) / 86_400_000;
    if (daysSinceJoin < MIN_MEMBER_DAYS) {
      await i.reply({
        embeds: [errorEmbed(`Bạn cần ở server ít nhất **${MIN_MEMBER_DAYS} ngày** mới được chuyển coins.`)],
        ephemeral: true,
      });
      return;
    }
  }

  // Giới hạn 500 coins/ngày
  const todayTotal = Eco.getTodayTransferTotal(i.user.id, i.guildId!);
  if (todayTotal + amount > DAILY_TRANSFER_LIMIT) {
    const remaining = Math.max(0, DAILY_TRANSFER_LIMIT - todayTotal);
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.WARNING)
        .setTitle('⚠️ Vượt giới hạn chuyển tiền!')
        .setDescription(`Giới hạn **${DAILY_TRANSFER_LIMIT} coins/ngày**.\nHôm nay đã chuyển **${formatCoins(todayTotal)} coins**, còn có thể chuyển **${formatCoins(remaining)} coins**.`)],
      ephemeral: true,
    });
    return;
  }

  const tax      = Math.floor(amount * TRANSFER_TAX_RATE);
  const received = amount - tax;

  const success = Eco.deductCoins(i.user.id, i.guildId!, amount);
  if (!success) {
    const user = Eco.getOrCreate(i.user.id, i.guildId!);
    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(COLOR.DANGER)
        .setTitle('❌ Không đủ coins!')
        .setDescription(`Bạn chỉ có **${formatCoins(user.balance)} coins** thôi.`)],
      ephemeral: true,
    });
    return;
  }

  Eco.addCoins(target.id, i.guildId!, received);
  Eco.logTransaction(i.user.id, i.guildId!, -amount, 'pay', `to:${target.id}`);
  Eco.logTransaction(target.id, i.guildId!, received, 'receive', `from:${i.user.id}`);

  const remaining = Eco.getOrCreate(i.user.id, i.guildId!).balance;

  await i.reply({
    embeds: [new EmbedBuilder()
      .setColor(COLOR.SUCCESS)
      .setTitle('💸 Chuyển thành công')
      .setDescription(`**${formatCoins(amount)} coins** → <@${target.id}> *(nhận ${formatCoins(received)} coins, phí ${formatCoins(tax)})*`)
      .addFields(
        { name: '👛 Còn lại', value: `${formatCoins(remaining)} coins`, inline: true },
      )
      .setTimestamp()],
  });
}
