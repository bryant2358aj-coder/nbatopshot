import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MomentStats {
  points: number;
  rebounds: number;
  assists: number;
  blocks: number;
  steals: number;
  fgPct: number;
  threePtPct: number;
  ftPct: number;
  plusMinus: number;
  minutes: string;
}

export interface ParsedMoment {
  id: string;
  url: string;
  playerName: string;
  firstName: string;
  lastName: string;
  teamName: string;
  jerseyNumber: string;
  position: string;
  playCategory: string;
  tier: 'COMMON' | 'FANDOM' | 'RARE' | 'LEGENDARY' | 'ULTIMATE';
  serialNumber: string;
  totalCirculation: string;
  seriesName: string;
  setName: string;
  nbaSeason: string;
  dateOfMoment: string;
  description: string;
  shortDescription: string;
  matchup: string;
  lowAskUsd: number;
  avgSaleUsd: number;
  heroImage: string;
  playerImage: string;
  categoryImage: string;
  logosImage: string;
  jerseyImage: string;
  videoTall: string;
  videoSquare: string;
  stats: MomentStats;
  attributes: {
    offense: number;
    defense: number;
    handles: number;
    finishing: number;
    shooting: number;
    clutch: number;
    overall: number;
  };
}

const momentCache = new Map<string, ParsedMoment>();

export interface TipRecord {
  id: string;
  senderUsername: string;
  recipientUsername: string;
  recipientWallet: string;
  momentId: string;
  momentPlayer: string;
  momentPlay: string;
  momentSerial: string;
  momentTier: string;
  momentImage: string;
  message: string;
  timestamp: string;
}

const tipLedger: TipRecord[] = [
  {
    id: 'tip-1',
    senderUsername: 'SpursNation_210',
    recipientUsername: 'BryantAbdulJabbar',
    recipientWallet: '0x113864b7d80045a6',
    momentId: '51950242',
    momentPlayer: 'Victor Wembanyama',
    momentPlay: 'Block',
    momentSerial: '#529/1000',
    momentTier: 'COMMON',
    momentImage: 'https://assets.nbatopshot.com/media/51950242?type=hero&format=webp&width=720&quality=85',
    message: 'Respect for building the Top Shot 1v1 Blacktop court! Wemby paint defense is unreal.',
    timestamp: '2026-10-12T01:40:00Z'
  },
  {
    id: 'tip-2',
    senderUsername: 'AntMan_Wolves5',
    recipientUsername: 'BryantAbdulJabbar',
    recipientWallet: '0x113864b7d80045a6',
    momentId: '51703760',
    momentPlayer: 'Anthony Edwards',
    momentPlay: 'Handles',
    momentSerial: '#727/1000',
    momentTier: 'COMMON',
    momentImage: 'https://assets.nbatopshot.com/media/51703760?type=hero&format=webp&width=720&quality=85',
    message: 'Sending love to @BryantAbdulJabbar! That Bag Work Ant-Man jelly layup cooks everyone in 1v1.',
    timestamp: '2026-10-12T02:15:00Z'
  }
];

function extractBalancedJson(str: string, startIdx: number): any {
  const firstBrace = str.indexOf('{', startIdx);
  if (firstBrace === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = firstBrace; i < str.length; i++) {
    const c = str[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (!inStr) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(str.slice(firstBrace, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function computeAttributes(
  playCategory: string,
  tier: string,
  position: string,
  stats: MomentStats,
  serialNum: number,
  totalCirc: number
) {
  const cat = (playCategory || '').toUpperCase();
  const tierBonus =
    tier === 'ULTIMATE' ? 12 :
    tier === 'LEGENDARY' ? 9 :
    tier === 'RARE' ? 6 :
    tier === 'FANDOM' ? 4 : 2;

  const serialRatio = totalCirc > 0 ? 1 - Math.min(1, serialNum / totalCirc) : 0.5;
  const serialBonus = Math.round(serialRatio * 5);

  let shooting = 76 + Math.min(16, Math.round((stats.threePtPct || 35) * 0.22 + (stats.fgPct || 48) * 0.1));
  let finishing = 78 + Math.min(16, Math.round((stats.points || 18) * 0.35 + (stats.fgPct || 50) * 0.08));
  let handles = 75 + Math.min(17, Math.round((stats.assists || 3) * 1.4 + (stats.points || 18) * 0.25));
  let defense = 74 + Math.min(18, Math.round((stats.blocks || 1) * 2.5 + (stats.steals || 1) * 2.5 + (stats.rebounds || 5) * 0.5));
  let clutch = 77 + Math.min(16, Math.round(Math.max(0, stats.plusMinus || 5) * 0.45 + (stats.ftPct || 78) * 0.08));

  if (cat.includes('BLOCK') || cat.includes('STEAL')) {
    defense += 9;
    clutch += 4;
  } else if (cat.includes('HANDLES') || cat.includes('ASSIST') || cat.includes('LAYUP')) {
    handles += 9;
    finishing += 6;
  } else if (cat.includes('3 POINTER') || cat.includes('JUMP SHOT')) {
    shooting += 10;
    clutch += 5;
  } else if (cat.includes('DUNK') || cat.includes('ALLEY')) {
    finishing += 10;
    clutch += 4;
  }

  if (position.includes('C') || position.includes('PF') || position.includes('F')) {
    defense += 3;
    finishing += 2;
  }
  if (position.includes('G') || position.includes('PG') || position.includes('SG')) {
    handles += 4;
    shooting += 3;
  }

  const clamp = (v: number) => Math.max(68, Math.min(99, Math.round(v + tierBonus * 0.5 + serialBonus * 0.4)));
  const finalShooting = clamp(shooting);
  const finalFinishing = clamp(finishing);
  const finalHandles = clamp(handles);
  const finalDefense = clamp(defense);
  const finalClutch = clamp(clutch);
  const finalOffense = clamp((finalShooting + finalFinishing + finalHandles) / 3);
  const overall = Math.min(99, Math.round((finalOffense * 0.35 + finalDefense * 0.3 + finalHandles * 0.15 + finalClutch * 0.2) + 2));

  return {
    offense: finalOffense,
    defense: finalDefense,
    handles: finalHandles,
    finishing: finalFinishing,
    shooting: finalShooting,
    clutch: finalClutch,
    overall
  };
}

async function fetchAndParseMoment(momentId: string): Promise<ParsedMoment> {
  const cleanId = momentId.replace(/\D/g, '');
  if (!cleanId) {
    throw new Error('Invalid NBA Top Shot Moment ID');
  }
  if (momentCache.has(cleanId)) {
    return momentCache.get(cleanId)!;
  }

  const url = `https://nbatopshot.com/moment/${cleanId}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml'
    }
  });

  if (!res.ok) {
    throw new Error(`NBA Top Shot returned status ${res.status} for Moment #${cleanId}`);
  }

  const html = await res.text();

  const ogTitle =
    (html.match(/property="og:title"\s+content="(.*?)"/i) ||
      html.match(/content="(.*?)"\s+property="og:title"/i))?.[1] || '';
  const ogDesc =
    (html.match(/property="og:description"\s+content="(.*?)"/i) ||
      html.match(/content="(.*?)"\s+property="og:description"/i))?.[1] || '';

  // Parse ogTitle e.g. "Victor Wembanyama Block - COMMON #529/1000"
  let playerName = 'NBA Top Shot Player';
  let playCategory = 'Highlight';
  let tier: ParsedMoment['tier'] = 'COMMON';
  let serialNumber = '1';
  let totalCirculation = '1000';

  const titleMatch = ogTitle.match(/^(.*?)\s+(Block|Handles|Dunk|3 Pointer|Assist|Steal|Layup|Jump Shot|Hook Shot|Alley-Oop|Reel)\s*-\s*([A-Z]+)\s*#(\d+)\/(\d+)/i);
  if (titleMatch) {
    playerName = titleMatch[1].trim();
    playCategory = titleMatch[2].trim();
    const rawTier = titleMatch[3].toUpperCase();
    if (['COMMON', 'FANDOM', 'RARE', 'LEGENDARY', 'ULTIMATE'].includes(rawTier)) {
      tier = rawTier as ParsedMoment['tier'];
    }
    serialNumber = titleMatch[4];
    totalCirculation = titleMatch[5];
  } else if (ogTitle && !ogTitle.startsWith('Moment #')) {
    const dashParts = ogTitle.split(' - ');
    if (dashParts[0]) {
      playerName = dashParts[0].trim();
    }
  }

  // Extract team from ogDesc e.g. "Victor Wembanyama Block Moment from San Antonio Spurs. COMMON tier, serial #529 of 1000."
  let teamName = 'NBA All-Stars';
  const descTeamMatch = ogDesc.match(/Moment from ([^.]+)\./i);
  if (descTeamMatch) {
    teamName = descTeamMatch[1].trim();
  }

  // Reconstruct Next.js RSC stream to get deep editionTemplate & stats
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g)]
    .map((m) => {
      try {
        return JSON.parse('"' + m[1] + '"');
      } catch {
        return '';
      }
    })
    .join('');

  let firstName = playerName.split(' ')[0] || 'Player';
  let lastName = playerName.split(' ').slice(1).join(' ') || '';
  let jerseyNumber = '1';
  let position = 'G/F';
  let seriesName = 'Series 2025-26';
  let setName = 'Base Set';
  let nbaSeason = '2025-26';
  let dateOfMoment = '2026';
  let description = ogDesc || `Official NBA Top Shot ${playCategory} Moment by ${playerName}.`;
  let shortDescription = `${playerName} ${playCategory} Showcase`;
  let matchup = `${teamName} Showcase`;
  let lowAskUsd = 3;
  let avgSaleUsd = 2;
  let videoSquareUrl = `https://assets.nbatopshot.com/media/${cleanId}?type=video-square`;
  let videoTallUrl = `https://assets.nbatopshot.com/media/${cleanId}?type=video-tall`;

  const stats: MomentStats = {
    points: 22,
    rebounds: 6,
    assists: 4,
    blocks: 1,
    steals: 1,
    fgPct: 52.4,
    threePtPct: 38.5,
    ftPct: 84.0,
    plusMinus: 8,
    minutes: '34:10'
  };

  // Check price cents in chunks
  const lowAskMatch = chunks.match(/"lowAskCents":"\$n(\d+)"/);
  if (lowAskMatch) {
    lowAskUsd = Math.max(1, Math.round(parseInt(lowAskMatch[1], 10) / 100));
  }
  const avgSaleMatch = chunks.match(/"averageSalePriceCents":"\$n(\d+)"/);
  if (avgSaleMatch) {
    avgSaleUsd = Math.max(1, Math.round(parseInt(avgSaleMatch[1], 10) / 100));
  }

  const seriesIdx = chunks.indexOf('"series":');
  if (seriesIdx !== -1) {
    const seriesObj = extractBalancedJson(chunks, seriesIdx);
    if (seriesObj?.name) seriesName = seriesObj.name;
  }

  const setIdx = chunks.indexOf('"set":');
  if (setIdx !== -1) {
    const setObj = extractBalancedJson(chunks, setIdx);
    if (setObj?.name) setName = setObj.name;
  }

  const templateIdx = chunks.indexOf('"editionTemplate":');
  if (templateIdx !== -1) {
    const templateObj = extractBalancedJson(chunks, templateIdx);
    const meta = templateObj?.metadata;
    if (meta) {
      if (meta.FullName) playerName = meta.FullName;
      if (meta.FirstName) firstName = meta.FirstName;
      if (meta.LastName) lastName = meta.LastName;
      if (meta.CurrentTeam || meta.TeamAtMoment) teamName = meta.CurrentTeam || meta.TeamAtMoment;
      if (meta.JerseyNumber) jerseyNumber = String(meta.JerseyNumber);
      if (meta.PrimaryPosition) position = meta.PrimaryPosition;
      if (meta.PlayCategory) playCategory = meta.PlayCategory;
      if (meta.NbaSeason) nbaSeason = meta.NbaSeason;
      if (meta.DateOfMoment) dateOfMoment = String(meta.DateOfMoment).split('T')[0];
      if (meta.Description) description = meta.Description;
      if (meta.ShortDescription) shortDescription = meta.ShortDescription;
      if (meta.HomeTeamName && meta.AwayTeamName) {
        const hScore = meta.HomeTeamScore ? ` ${meta.HomeTeamScore}` : '';
        const aScore = meta.AwayTeamScore ? ` ${meta.AwayTeamScore}` : '';
        matchup = `${meta.AwayTeamName}${aScore} @ ${meta.HomeTeamName}${hScore}`;
      }

      if (meta.Videos) {
        try {
          const vids = JSON.parse(meta.Videos);
          if (Array.isArray(vids)) {
            const tall = vids.find((v: any) => String(v.type).includes('VERTICAL'));
            const sq = vids.find((v: any) => String(v.type).includes('SQUARE'));
            if (tall?.url) videoTallUrl = tall.url;
            if (sq?.url) videoSquareUrl = sq.url;
          }
        } catch {}
      }

      if (meta.PlayerGameScores) {
        try {
          const gs = JSON.parse(meta.PlayerGameScores);
          const getNum = (k1: string, k2: string, def: number) =>
            gs[k1] !== undefined ? Number(gs[k1]) : gs[k2] !== undefined ? Number(gs[k2]) : def;
          stats.points = getNum('points', 'Points', stats.points);
          stats.rebounds = getNum('rebounds', 'Rebounds', stats.rebounds);
          stats.assists = getNum('assists', 'Assists', stats.assists);
          stats.blocks = getNum('blocks', 'Blocks', stats.blocks);
          stats.steals = getNum('steals', 'Steals', stats.steals);
          stats.fgPct = Number(getNum('fieldGoalsPercentage', 'FieldGoalsPercentage', stats.fgPct).toFixed(1));
          stats.threePtPct = Number(getNum('threePointsPercentage', 'ThreePointsPercentage', stats.threePtPct).toFixed(1));
          stats.ftPct = Number(getNum('freeThrowsPercentage', 'FreeThrowsPercentage', stats.ftPct).toFixed(1));
          stats.plusMinus = getNum('plusMinus', 'PlusMinus', stats.plusMinus);
          stats.minutes = gs.minutes || gs.Minutes || stats.minutes;
          if (!meta.PrimaryPosition && (gs.playerPosition || gs.PlayerPosition)) {
            position = gs.playerPosition || gs.PlayerPosition;
          }
        } catch {}
      }
    }
  }

  const attributes = computeAttributes(
    playCategory,
    tier,
    position,
    stats,
    parseInt(serialNumber, 10) || 500,
    parseInt(totalCirculation, 10) || 1000
  );

  const parsed: ParsedMoment = {
    id: cleanId,
    url,
    playerName,
    firstName,
    lastName,
    teamName,
    jerseyNumber,
    position,
    playCategory,
    tier,
    serialNumber,
    totalCirculation,
    seriesName,
    setName,
    nbaSeason,
    dateOfMoment,
    description,
    shortDescription,
    matchup,
    lowAskUsd,
    avgSaleUsd,
    heroImage: `https://assets.nbatopshot.com/media/${cleanId}?type=hero&format=webp&width=720&quality=85`,
    playerImage: `https://assets.nbatopshot.com/media/${cleanId}?type=player&format=webp&width=240&quality=85`,
    categoryImage: `https://assets.nbatopshot.com/media/${cleanId}?type=category&format=webp&width=240&quality=85`,
    logosImage: `https://assets.nbatopshot.com/media/${cleanId}?type=logos&format=webp&width=240&quality=85`,
    jerseyImage: `https://assets.nbatopshot.com/media/${cleanId}?type=jersey&format=webp&width=240&quality=85`,
    videoTall: videoTallUrl,
    videoSquare: videoSquareUrl,
    stats,
    attributes
  };

  momentCache.set(cleanId, parsed);
  return parsed;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Pre-warm the two featured moments requested by the user
  Promise.allSettled([
    fetchAndParseMoment('51950242'),
    fetchAndParseMoment('51703760')
  ]).catch(() => {});

  app.get('/api/moment/:id', async (req, res) => {
    try {
      const rawId = req.params.id || '';
      const data = await fetchAndParseMoment(rawId);
      res.json(data);
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || 'Unable to load NBA Top Shot Moment.'
      });
    }
  });

  app.get('/api/tips', (_req, res) => {
    res.json({
      recipient: {
        username: 'BryantAbdulJabbar',
        flowWallet: '0x113864b7d80045a6',
        profileUrl: 'https://nbatopshot.com/user/@BryantAbdulJabbar',
        avatarUrl: 'https://nbatopshot.com/og/user/0x113864b7d80045a6?brand=nba'
      },
      tips: tipLedger
    });
  });

  app.post('/api/tips', async (req, res) => {
    try {
      const { senderUsername, momentInput, message } = req.body || {};
      const rawId = String(momentInput || '51950242').match(/(\d{6,9})/)?.[1] || '51950242';
      let momentData: ParsedMoment | null = null;
      try {
        momentData = await fetchAndParseMoment(rawId);
      } catch {}

      const newTip: TipRecord = {
        id: `tip-${Date.now()}`,
        senderUsername: (senderUsername || 'AnonymousCollector').trim().replace(/^@/, ''),
        recipientUsername: 'BryantAbdulJabbar',
        recipientWallet: '0x113864b7d80045a6',
        momentId: rawId,
        momentPlayer: momentData?.playerName || `Moment #${rawId}`,
        momentPlay: momentData?.playCategory || 'Highlight',
        momentSerial: momentData ? `#${momentData.serialNumber}/${momentData.totalCirculation}` : '#1/1000',
        momentTier: momentData?.tier || 'COMMON',
        momentImage: `https://assets.nbatopshot.com/media/${rawId}?type=hero&format=webp&width=720&quality=85`,
        message: (message || 'Tipped an NBA Top Shot Moment for the 1v1 Halfcourt Game!').trim(),
        timestamp: new Date().toISOString()
      };

      tipLedger.unshift(newTip);
      res.json({ success: true, tip: newTip, tips: tipLedger });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to record tip' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Top Shot 1v1 Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
