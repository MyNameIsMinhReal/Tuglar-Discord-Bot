import { GuildMember } from 'discord.js';
import { removeAllTierRoles } from '../services/BoosterService';

export const name = 'guildMemberUpdate';
export const once = false;

export async function execute(before: GuildMember, after: GuildMember): Promise<void> {
  if (before.premiumSince !== null && after.premiumSince === null) {
    await removeAllTierRoles(after).catch(err =>
      console.error('guildMemberUpdate: removeAllTierRoles error:', err)
    );
  }
}
