import cron from 'node-cron';
import { Client, TextChannel } from 'discord.js';
import { db } from '../database';
import { DeadlineRow } from '../types';

export function startDeadlineChecker(client: Client): void {
  cron.schedule('*/5 * * * *', async () => {
    try { await checkDeadlines(client); }
    catch (err) { console.error('[DeadlineService] Error:', err); }
  });
  console.log('✅ Deadline checker started (every 5 min)');
}

async function checkDeadlines(client: Client): Promise<void> {
  const now = new Date();
  const deadlines = db.prepare(`
    SELECT * FROM deadlines WHERE is_done = 0 AND due_date > datetime('now', '-1 minute')
  `).all() as unknown as DeadlineRow[];

  for (const d of deadlines) {
    const due = new Date(d.due_date);
    const diffMin = (due.getTime() - now.getTime()) / 60_000;

    let msg = '';
    let updateCol = '';

    if (diffMin <= 30 && diffMin > 0 && !d.reminded_30m) {
      msg = `ơi còn **30 phút** nữa là hết hạn **${d.title}** rồi đó${d.subject ? ` (${d.subject})` : ''}, nhanh lên!`;
      updateCol = 'reminded_30m';
    } else if (diffMin <= 180 && diffMin > 30 && !d.reminded_3h) {
      msg = `nhắc nhở nha, **${d.title}**${d.subject ? ` (${d.subject})` : ''} còn **3 tiếng** nữa là deadline`;
      updateCol = 'reminded_3h';
    } else if (diffMin <= 1440 && diffMin > 180 && !d.reminded_1d) {
      msg = `mai là deadline **${d.title}**${d.subject ? ` (${d.subject})` : ''} rồi đó, nhớ làm nha`;
      updateCol = 'reminded_1d';
    }

    if (!msg || !updateCol) continue;

    try {
      const channelId = process.env.REMINDER_CHANNEL_ID || d.channel_id;
      const channel = await client.channels.fetch(channelId) as TextChannel;
      if (!channel?.isTextBased()) continue;

      await channel.send({ content: `<@${d.user_id}> ${msg}` });
      db.prepare(`UPDATE deadlines SET ${updateCol} = 1 WHERE id = ?`).run(d.id);
    } catch (err) {
      console.error(`[DeadlineService] #${d.id}:`, err);
    }
  }
}