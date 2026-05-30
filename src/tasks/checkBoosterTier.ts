import cron from 'node-cron';
import { Client, TextChannel } from 'discord.js';
import { BOOSTER_SERVER_ID, LOG_CHANNEL_ID, updateBoosterRole } from '../services/BoosterService';

async function runCheck(client: Client): Promise<void> {
  const guild = client.guilds.cache.get(BOOSTER_SERVER_ID);
  if (!guild) return;

  try {
    await guild.members.fetch();
  } catch {
    console.warn('⚠️  checkBoosterTier: could not fetch members');
    return;
  }

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID) as TextChannel | null;
  let processed = 0;

  for (const [, member] of guild.members.cache) {
    try {
      await updateBoosterRole(member, logChannel);
      processed++;
    } catch (err) {
      console.error(`checkBoosterTier: error on ${member.displayName}:`, err);
    }
  }

  console.log(`✅ checkBoosterTier: processed ${processed} members`);
}

export function startCheckBoosterTierTask(client: Client): void {
  runCheck(client);
  cron.schedule('0 0 * * *', () => runCheck(client));
  console.log('✅ Check booster tier task started (daily at 00:00)');
}
