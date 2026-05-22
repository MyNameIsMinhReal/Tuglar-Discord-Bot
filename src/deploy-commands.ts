import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import path from 'path';
import fs from 'fs';

const commands: any[] = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`📋 Prepared: /${command.data.name}`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
const clientId = process.env.CLIENT_ID!;
const guildId  = process.env.GUILD_ID;

async function deploy() {
  try {
    console.log(`\n🔄 Registering ${commands.length} slash commands...`);

    if (guildId) {
      // Guild deploy: cập nhật ngay lập tức (dùng khi dev)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Deployed to guild ${guildId} (instant)`);
    } else {
      // Global deploy: mất ~1 tiếng để cập nhật (dùng khi production)
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('✅ Deployed globally (may take up to 1 hour)');
    }

    console.log('\n📋 Commands registered:');
    commands.forEach(c => console.log(`  • /${c.name} — ${c.description}`));
  } catch (error) {
    console.error('❌ Deploy failed:', error);
    process.exit(1);
  }
}

deploy();
