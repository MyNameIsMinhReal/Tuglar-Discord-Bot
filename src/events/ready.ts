import { Client, ActivityType } from 'discord.js';
import { startDeadlineChecker } from '../services/DeadlineService';

export const name = 'clientReady';
export const once = true;

export async function execute(client: Client): Promise<void> {
  console.log(`\n🤖 Bot đã online: ${client.user?.tag}`);
  console.log(`📡 Đang phục vụ ${client.guilds.cache.size} server(s)\n`);

  // Set bot activity
  client.user?.setPresence({
    activities: [{
      name: '/help | 📚 Study Bot',
      type: ActivityType.Watching,
    }],
    status: 'online',
  });

  // Khởi động deadline checker
  startDeadlineChecker(client);
}
