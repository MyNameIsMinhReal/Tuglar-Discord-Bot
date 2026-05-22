import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import * as Eco from '../services/EconomyService';
import { COLOR } from '../utils/embeds';
import { formatCoins } from '../utils/helpers';
import path from 'path';
import fs from 'fs';
import { ShopItem } from '../types';
import { db } from '../database';

let shopItems: ShopItem[] = [];
try {
  shopItems = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'shop_items.json'), 'utf-8'));
} catch {}

export const data = new SlashCommandBuilder()
  .setName('eco')
  .setDescription('Hệ thống coins')
  .addSubcommand(sub => sub.setName('daily').setDescription('Nhận coins hàng ngày'))
  .addSubcommand(sub => sub.setName('balance').setDescription('Xem số dư'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('Bảng xếp hạng'))
  .addSubcommand(sub => sub.setName('shop').setDescription('Xem shop'))
  .addSubcommand(sub => sub
    .setName('buy')
    .setDescription('Mua đồ')
    .addStringOption(o => o.setName('item_id').setDescription('ID vật phẩm').setRequired(true))
  )
  .addSubcommand(sub => sub
    .setName('pay')
    .setDescription('Chuyển coins')
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
    return void await i.reply({
      content: `chưa đến giờ đâu, còn **${h}h ${m}m** nữa mới được nhận tiếp nha`,
      ephemeral: true,
    });
  }

  const reward = Eco.claimDaily(i.user.id, i.guildId!);
  const user = Eco.getOrCreate(i.user.id, i.guildId!);
  const msgs = [
    `đây **+${formatCoins(reward)} coins** của bạn! số dư hiện tại: **${formatCoins(user.balance)} coins**`,
    `daily nhận rồi nha — **+${formatCoins(reward)} coins**! còn **${formatCoins(user.balance)} coins** tổng cộng`,
    `**+${formatCoins(reward)} coins** điểm danh xong! ví bạn có **${formatCoins(user.balance)} coins**`,
  ];
  await i.reply({ content: msgs[Math.floor(Math.random() * msgs.length)] });
}

async function handleBalance(i: ChatInputCommandInteraction): Promise<void> {
  const user = Eco.getOrCreate(i.user.id, i.guildId!);
  const rank = (db.prepare(
    'SELECT COUNT(*) + 1 as rank FROM economy WHERE guild_id = ? AND balance > ?'
  ).get(i.guildId!, user.balance) as any).rank;

  await i.reply({
    content: `ví của bạn: **${formatCoins(user.balance)} coins** | hạng #${rank} trên server\ntổng kiếm được từ trước đến nay: ${formatCoins(user.total_earned)} coins`,
  });
}

async function handleLeaderboard(i: ChatInputCommandInteraction): Promise<void> {
  const top = Eco.getLeaderboard(i.guildId!, 10);
  if (top.length === 0) {
    return void await i.reply({ content: 'chưa có ai có coins hết 😅' });
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, idx) => {
    const me = u.user_id === i.user.id ? ' ← bạn' : '';
    return `${medals[idx] ?? `${idx + 1}.`} <@${u.user_id}> — **${formatCoins(u.balance)} coins**${me}`;
  });

  await i.reply({ content: `top giàu nhất server:\n\n${lines.join('\n')}` });
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

  const embed = new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle('🛒 Shop')
    .setDescription(`Ví của bạn: **${formatCoins(user.balance)} coins** | Dùng \`/eco buy <id>\` để mua`)
    .setFooter({ text: 'Liên hệ admin sau khi mua để nhận quyền lợi' });

  for (const [cat, items] of grouped) {
    const lines = items.map(it =>
      `${it.emoji} **${it.name}** — \`${formatCoins(it.price)}\` coins\n└ ${it.description} · ID: \`${it.id}\``
    );
    embed.addFields({ name: CATEGORY_LABEL[cat] ?? cat, value: lines.join('\n') });
  }

  await i.reply({ embeds: [embed] });
}

async function handleBuy(i: ChatInputCommandInteraction): Promise<void> {
  const itemId = i.options.getString('item_id', true);
  const item = shopItems.find(s => s.id === itemId);
  if (!item) {
    return void await i.reply({ content: `không tìm thấy item \`${itemId}\` đâu cả`, ephemeral: true });
  }

  const success = Eco.deductCoins(i.user.id, i.guildId!, item.price);
  if (!success) {
    const user = Eco.getOrCreate(i.user.id, i.guildId!);
    return void await i.reply({
      content: `không đủ tiền rồi 😅 cần **${formatCoins(item.price)} coins** nhưng bạn chỉ có **${formatCoins(user.balance)} coins**`,
      ephemeral: true,
    });
  }

  db.prepare(
    'INSERT INTO shop_purchases (user_id, guild_id, item_id, item_name, price) VALUES (?, ?, ?, ?, ?)'
  ).run(i.user.id, i.guildId!, item.id, item.name, item.price);

  await i.reply({ content: `mua **${item.emoji} ${item.name}** thành công! liên hệ admin để nhận quyền lợi nha` });
}

async function handlePay(i: ChatInputCommandInteraction): Promise<void> {
  const target = i.options.getUser('user', true);
  const amount = i.options.getInteger('amount', true);

  if (target.id === i.user.id) return void await i.reply({ content: 'tự chuyển cho mình thì không được đâu 😄', ephemeral: true });
  if (target.bot) return void await i.reply({ content: 'bot không nhận tiền đâu bạn ơi', ephemeral: true });

  const success = Eco.deductCoins(i.user.id, i.guildId!, amount);
  if (!success) {
    const user = Eco.getOrCreate(i.user.id, i.guildId!);
    return void await i.reply({
      content: `không đủ tiền, bạn chỉ có **${formatCoins(user.balance)} coins** thôi`,
      ephemeral: true,
    });
  }

  Eco.addCoins(target.id, i.guildId!, amount);
  const bal = Eco.getOrCreate(i.user.id, i.guildId!).balance;
  await i.reply({
    content: `chuyển **${formatCoins(amount)} coins** cho <@${target.id}> xong rồi!\nbạn còn lại **${formatCoins(bal)} coins**`,
  });
}