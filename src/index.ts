import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { BotCommand } from './types';
import { initDatabase } from './database/schema';
import { loadGachaPool } from './services/GachaService';
import { startExpireCosmeticsTask } from './tasks/expireCosmetics';

// ── Init DB & Data ─────────────────────────────────────────────────
initDatabase();
loadGachaPool();
startExpireCosmeticsTask();

// ── Create Client ──────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection<string, BotCommand>();

// ── Load Commands ──────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command: BotCommand = require(filePath);
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`✅ Loaded command: /${command.data.name}`);
  } else {
    console.warn(`⚠️ Skipped ${file}: missing data or execute`);
  }
}

// ── Load Events ────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`✅ Loaded event: ${event.name}`);
}

// ── Login ──────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN not set in .env!');
  process.exit(1);
}

client.login(token).then(() => {
  console.log('\n🚀 Bot đang khởi động...');
}).catch(err => {
  console.error('❌ Login failed:', err);
  process.exit(1);
});

// ── Graceful Shutdown ──────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n👋 Bot đang tắt...');
  client.destroy();
  process.exit(0);
});
