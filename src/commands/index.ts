import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  PermissionFlagsBits,
} from 'discord.js';
import {
  FOOTER_TEXT, BOOSTER_ROLE_ID, ALL_COLOR_ROLES, ALL_TIER_ROLE_IDS,
} from '../services/BoosterService';

export const data = new SlashCommandBuilder()
  .setName('index')
  .setDescription('Sổ tay Role Đảo Tuglar (hoặc tra cứu role bất kỳ)')
  .addRoleOption(o =>
    o.setName('role')
      .setDescription('Role muốn tra cứu (bỏ trống để mở Sổ Tay)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const roleOpt = interaction.options.getRole('role');

  // ── Kịch bản 1: tra cứu role ─────────────────────────────────────
  if (roleOpt) {
    const guildRole = guild.roles.cache.get(roleOpt.id);
    const memberCount = guildRole?.members.size ?? 0;

    let howToGet = 'Đang cập nhật... (Role ẩn hoặc Role Sự kiện)';
    let perks = 'Chưa có thông tin';

    if (roleOpt.id === BOOSTER_ROLE_ID) {
      howToGet = 'Nạp Boost cho Server (Mở khóa Tier 0)';
      perks = '<:perk_collection:1193667977405534218> Truy cập Kho đồ Màu Sắc';
    } else if ([...ALL_COLOR_ROLES, ...ALL_TIER_ROLE_IDS].includes(roleOpt.id)) {
      howToGet = 'Mở khóa từ Đặc quyền Booster (Dùng lệnh `/profile`)';
      perks = '<:perk_displayseperately:1193783034323931207> Trang trí Profile';
    } else if (guildRole?.permissions.has(PermissionFlagsBits.Administrator)) {
      howToGet = 'Role đặc quyền dành cho Ban Quản Trị';
      perks = 'Toàn quyền quản lý Server';
    }

    const embed = new EmbedBuilder()
      .setColor(guildRole?.color || 0xff73fa)
      .setTitle('🔍 KẾT QUẢ TRA CỨU ROLE')
      .setDescription(
        `## <@&${roleOpt.id}>\n` +
        ` - Cách nhận: **${howToGet}**\n` +
        ` - Đặc quyền: ${perks}\n` +
        ` - Sở hữu: \`${memberCount}\` người`,
      )
      .setTimestamp()
      .setFooter({ text: FOOTER_TEXT });

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    return;
  }

  // ── Kịch bản 2: sổ tay phân trang ───────────────────────────────
  const countRole = (id: string) => guild.roles.cache.get(id)?.members.size ?? 0;
  const pages = buildPages(countRole);
  let page = 0;

  const makeEmbed = (p: number) =>
    new EmbedBuilder()
      .setColor(0xff73fa)
      .setDescription(pages[p])
      .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
      .setTimestamp()
      .setFooter({ text: FOOTER_TEXT });

  const makeRow = (p: number) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('idx_prev').setLabel('◀ Trước').setStyle(ButtonStyle.Primary)
        .setDisabled(p === 0),
      new ButtonBuilder()
        .setCustomId('idx_page').setLabel(`Trang ${p + 1}/${pages.length}`)
        .setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder()
        .setCustomId('idx_next').setLabel('Sau ▶').setStyle(ButtonStyle.Primary)
        .setDisabled(p === pages.length - 1),
    );

  const msg = await interaction.reply({
    embeds: [makeEmbed(page)],
    components: [makeRow(page)],
    allowedMentions: { parse: [] },
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 180_000,
  });

  collector.on('collect', async btn => {
    if (btn.customId === 'idx_prev' && page > 0) page--;
    else if (btn.customId === 'idx_next' && page < pages.length - 1) page++;
    await btn.update({ embeds: [makeEmbed(page)], components: [makeRow(page)] });
  });

  collector.on('end', async () => {
    await interaction.editReply({
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('idx_prev').setLabel('◀ Trước')
            .setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId('idx_page').setLabel(`Trang ${page + 1}/${pages.length}`)
            .setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('idx_next').setLabel('Sau ▶')
            .setStyle(ButtonStyle.Primary).setDisabled(true),
        ),
      ],
    }).catch(() => {});
  });
}

function buildPages(count: (id: string) => number): string[] {
  return [
    `# 📘 SỔ TAY ROLE ĐẢO TUGLAR #
### ⚜️ Special Role ###
 Các role này thường chỉ dành cho một số người với các tiêu chí để nhận, đặc biệt hơn so với achievement role.

### 🎉 Event Role ###
 - Các role này thường chỉ xuất hiện **1 lần duy nhất** với các sự kiện để đánh dấu lại cột mốc thời gian bạn đã đồng hành cùng với server.`,

    `# 🎉 Event Role (Trang 1)
## <@&1466299698800365695> <:tet2026:1510063136831705270>
 - Ra mắt: <t:1771200240:D>
 - Cách nhận: **Chat trong server trong thời gian diễn ra Sự kiện Tết Bính Ngọ 2026**
 - Sở hữu: \`${count('1466299698800365695')}\`
## <@&1274907870701424755> <:trungthu2024:1510063138970800219>
 - Ra mắt: <t:1724112240:D>
 - Cách nhận: **Thu thập nguyên liệu làm Bánh Trung Thu 🥮 tại Sự kiện Tết Trung Thu 2024**
 - Sở hữu: \`${count('1274907870701424755')}\`
## <@&1240597343049486397> <:2anni:1510063188543275118>
 - Ra mắt: <t:1720483440:D>
 - Cách nhận: **Gửi lời chúc mừng sinh nhật server tròn 2 tuổi**
 - Sở hữu: \`${count('1240597343049486397')}\``,

    `# 🎉 Event Role (Trang 2)
## <@&1189375452603756645> <:tet2024:1510063134415650946>
 - Ra mắt: <t:1706720400:D>
 - Cách nhận: **Đổi mảnh 🧩 tại Sự kiện Trang trí Tết Giáp Thìn 2024**
 - Sở hữu: \`${count('1189375452603756645')}\`
## <@&1157198996234842143> <:1anni:1510063186429083648>
 - Ra mắt: <t:1688861040:D>
 - Cách nhận: **Tham gia SK SN 1 Tuổi Đảo Tuglar**
 - Sở hữu: \`${count('1157198996234842143')}\`
## <@&1169623255297032272> <:winterlands2023:1510063146583199994>
 - Ra mắt: <t:1698771600:D>
 - Cách nhận: **Tưới cây thông noel 🎄 trong thời gian diễn ra Sự kiện Winterlands 2023**
 - Sở hữu: \`${count('1169623255297032272')}\``,

    `# ⚜️ Special Role
## <@&1346173590642622528> <:DaoTuglarClanOld:1510063131584626688>
 - Ra mắt: <t:1688835600:D>
 - Cách nhận: **Tham gia Quân đoàn Free Fire Đảo Tuglar**
 - Sở hữu: \`${count('1346173590642622528')}\`
## <@&1175019718466359306> <:TuglarPars:1510063144532316242>
 - Ra mắt: Chưa cập nhật
 - Cách nhận: **Tham gia Clan Liên Quân TuglarPars**
 - Sở hữu: \`${count('1175019718466359306')}\`
## <@&1113018418300452894> <:TuglarPars:1510063144532316242>
 - Ra mắt: Chưa cập nhật
 - Cách nhận: **Tham gia CLB Par.**
 - Sở hữu: \`${count('1113018418300452894')}\``,
  ];
}
