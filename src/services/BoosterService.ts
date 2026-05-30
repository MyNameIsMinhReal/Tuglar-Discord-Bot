import { GuildMember, TextChannel, EmbedBuilder } from 'discord.js';

export const BOOSTER_SERVER_ID = '995320755002814514';
export const BOOSTER_ROLE_ID   = '1000062456007249930';
export const LOG_CHANNEL_ID    = '995612550383292458';
export const FOOTER_TEXT       = 'Tuglar Pick Role v2.8.0 • Cập nhật: 30/05/2026';

// days → tier role ID
export const BOOSTER_TIERS: Record<number, string> = {
  7:  '1509967931675640039',
  14: '1509970643993628672',
  21: '1509970708850020523',
  28: '1509970736767438879',
  35: '1509970770305224918',
  42: '1509970819932094584',
  49: '1509970853192798259',
  56: '1509962710928982288',
};

export const TIER_NAMES: Record<string, string> = {
  '1509967931675640039': 'Booster I',
  '1509970643993628672': 'Booster II',
  '1509970708850020523': 'Booster III',
  '1509970736767438879': 'Booster IV',
  '1509970770305224918': 'Booster V',
  '1509970819932094584': 'Booster VI',
  '1509970853192798259': 'Booster VII',
  '1509962710928982288': 'Booster VIII',
};

export const BOOSTER_EMOJIS: Record<string, string> = {
  '1509967931675640039': '<:IR_Booster_I:1510155243453808680>', // ID cũ do không có trong ảnh
  '1509970643993628672': '<:IR_Booster_II:1510155245194575953>',
  '1509970708850020523': '<:IR_Booster_III:1510155247115305070>',
  '1509970736767438879': '<:IR_Booster_IV:1510155249615114344>',
  '1509970770305224918': '<:IR_Booster_V:1510155251745947678>',
  '1509970819932094584': '<:IR_Booster_VI:1510155253964865607>',
  '1509970853192798259': '<:IR_Booster_VII:1510155256154296333>',
  '1509962710928982288': '<:IR_Booster_VIII:1510155258205175948>',
};

export const ALL_COLOR_ROLES: string[] = [
  '1162545019123666984', '1157298054764974130', '1157296480722366555',
  '1157297666879926304', '1157298499461840906', '1164764867769667664',
  '1164766440335876126', '1510012176876699768', '1164946570920337538',
  '1164946156858650635',
];

export const ALL_TIER_ROLE_IDS: string[] = Object.values(BOOSTER_TIERS);

export function getTargetTierRoleId(daysBoosted: number): string | null {
  const sorted = Object.keys(BOOSTER_TIERS).map(Number).sort((a, b) => b - a);
  for (const days of sorted) {
    if (daysBoosted >= days) return BOOSTER_TIERS[days];
  }
  return null;
}

export async function updateBoosterRole(
  member: GuildMember,
  logChannel: TextChannel | null,
): Promise<void> {
  if (!member.premiumSince) {
    await removeAllTierRoles(member);
    return;
  }

  const daysBoosted = Math.floor((Date.now() - member.premiumSince.getTime()) / 86_400_000);
  const targetId = getTargetTierRoleId(daysBoosted);
  if (!targetId) return;

  const targetRole = member.guild.roles.cache.get(targetId);
  if (!targetRole || member.roles.cache.has(targetId)) return;

  const oldRoles = ALL_TIER_ROLE_IDS
    .filter(id => id !== targetId)
    .map(id => member.guild.roles.cache.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r && member.roles.cache.has(r.id));

  const oldName = oldRoles[0]?.name ?? 'Booster';

  await member.roles.add(targetRole);
  if (oldRoles.length) await member.roles.remove(oldRoles);

  if (logChannel) {
    const emoji = BOOSTER_EMOJIS[targetId] ?? '✨';
    await logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff73fa)
          .setDescription(`> ${emoji}・Chúc mừng ${member} đã nâng cấp role **${oldName}** lên **${targetRole.name}**`)
          .setTimestamp()
          .setFooter({ text: FOOTER_TEXT }),
      ],
    });
  }
}

export async function removeAllTierRoles(member: GuildMember): Promise<void> {
  const toRemove = ALL_TIER_ROLE_IDS
    .map(id => member.guild.roles.cache.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r && member.roles.cache.has(r.id));
  if (toRemove.length) await member.roles.remove(toRemove);
}
