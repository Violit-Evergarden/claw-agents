'use strict';

const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '../data');

function clearDir(dirName) {
  const dir = path.join(DATA_ROOT, dirName);
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir);
  let count = 0;
  for (const f of files) {
    if (f.startsWith('_')) continue;
    fs.unlinkSync(path.join(dir, f));
    count++;
  }
  return count;
}

const memoryCount = clearDir('memory');
const storyCount = clearDir('story');
const personaCount = clearDir('personas');

console.log(`[reset-data] Cleared ${memoryCount} memory files, ${storyCount} story files, ${personaCount} persona files`);
console.log('[reset-data] Characters in data/characters/ were preserved');
