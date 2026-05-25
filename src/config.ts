import path from 'node:path';
import fs from 'node:fs';

interface EconomyConfig {
  dailyMin: number;
  dailyMax: number;
  packCosts: Record<string, number>;
  payTaxPercent: number;
  dailyTransferLimit: number;
  minMemberDays: number;
  challengeRewards: Record<string, number>;
  streakBonusMaxCoins: number;
  streakBonusPercent: Record<string, number>;
  gachaPity: { ssrHard: number; ssrSoft: number; srHard: number };
}

function loadConfig(): EconomyConfig {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'economy_config.json'), 'utf-8');
    return JSON.parse(raw) as EconomyConfig;
  } catch {
    // Fallback defaults nếu file không đọc được
    return {
      dailyMin: 25, dailyMax: 60,
      packCosts: { '1': 150, '5': 800, '10': 1350 },
      payTaxPercent: 5,
      dailyTransferLimit: 500,
      minMemberDays: 3,
      challengeRewards: { easy: 10, medium: 20, hard: 40 },
      streakBonusMaxCoins: 20,
      streakBonusPercent: { '3': 0.05, '7': 0.10, '14': 0.15, '30': 0.25 },
      gachaPity: { ssrHard: 80, ssrSoft: 50, srHard: 10 },
    };
  }
}

export const cfg = loadConfig();
