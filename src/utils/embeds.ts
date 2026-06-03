import { EmbedBuilder } from 'discord.js';

// ── Color Palette ──────────────────────────────────────────────────
export const COLOR = {
  PRIMARY:  0x5865F2,
  SUCCESS:  0x57F287,
  WARNING:  0xFEE75C,
  DANGER:   0xED4245,
  INFO:     0x5DADE2,
  GACHA_LEGENDARY: 0xFFD700,
  GACHA_EPIC:      0x9B59B6,
  ECONOMY:  0xF1C40F,
  GAME:     0x9B59B6,
  AI:       0x1ABC9C,
  JOURNAL:  0xE67E22,
};

// ── Generic Builders ───────────────────────────────────────────────

export function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR.SUCCESS)
    .setTitle(title)
    .setDescription(description);
}

export function errorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR.DANGER)
    .setDescription(description);
}

export function infoEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR.INFO)
    .setTitle(title)
    .setDescription(description);
}

export function loadingEmbed(text = 'Đang xử lý...'): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR.PRIMARY)
    .setDescription(text);
}

// ── Domain Embeds ──────────────────────────────────────────────────

export function deadlineEmbed(deadlines: any[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOR.WARNING)
    .setTitle('Deadline')
    .setTimestamp();

  if (deadlines.length === 0) {
    embed.setDescription('Không có deadline nào sắp tới.');
  } else {
    const lines = deadlines.map(d => {
      const due = new Date(d.due_date);
      const diff = due.getTime() - Date.now();
      const hours = Math.floor(diff / 3_600_000);
      const status = diff < 0 ? '— đã qua' : diff < 3 * 3_600_000 ? '— còn dưới 3h' : diff < 24 * 3_600_000 ? `— còn ${hours}h` : `— còn ${Math.floor(hours/24)} ngày`;
      const subject = d.subject ? ` [${d.subject}]` : '';
      const done = d.is_done ? ' ~~xong~~' : '';
      return `**#${d.id}**${subject} ${d.title}${done}\n${due.toLocaleString('vi-VN')} ${status}`;
    });
    embed.setDescription(lines.join('\n\n'));
  }

  return embed;
}

export function economyEmbed(username: string, balance: number, totalEarned: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR.ECONOMY)
    .setTitle(`Ví — ${username}`)
    .addFields(
      { name: 'Số dư', value: `**${balance.toLocaleString('vi-VN')} coins**`, inline: true },
      { name: 'Tổng kiếm được', value: `${totalEarned.toLocaleString('vi-VN')} coins`, inline: true }
    )
    .setTimestamp();
}

export function aiResponseEmbed(question: string, answer: string, subject?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOR.AI)
    .addFields({ name: 'Câu hỏi', value: question.slice(0, 256) })
    .setDescription(answer.slice(0, 4000))
    .setTimestamp();
  if (subject) embed.setFooter({ text: `Môn: ${subject}` });
  return embed;
}

// ── Rarity ─────────────────────────────────────────────────────────
export const RARITY_COLORS: Record<string, number> = {
  Legendary: 0xFFD700, Epic: 0x9B59B6, Rare: 0xCD7F32, Common: 0x9E9E9E,
};
export const RARITY_STARS: Record<string, string> = {
  Legendary: '✨✨✨', Epic: '⭐⭐', Rare: '⭐', Common: '·',
};