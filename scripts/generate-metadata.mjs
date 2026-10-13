#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const pdfsDir = path.join(root, 'pdfs');
const documentsDir = path.join(root, 'documents');
const metadataDate = process.env.METADATA_DATE || new Date().toISOString().slice(0, 10);

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const titleFromFilename = (filename) => {
  const basename = path.basename(filename, path.extname(filename));
  return basename.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || basename;
};

const files = fs.existsSync(pdfsDir)
  ? fs.readdirSync(pdfsDir)
      .filter((file) => /\.(pdf|jpg)$/i.test(file))
      .sort((a, b) => a.localeCompare(b))
  : [];

fs.mkdirSync(documentsDir, { recursive: true });

const existingMetadata = fs
  .readdirSync(documentsDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => {
    const filePath = path.join(documentsDir, file);
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid JSON in ${file}: ${error.message}`);
    }
  });

const existingPaths = new Set(existingMetadata.map((item) => item.file).filter(Boolean));
const usedIds = new Set(existingMetadata.map((item) => item.id).filter(Boolean));
let created = 0;

for (const filename of files) {
  const file = `pdfs/${filename}`;
  if (existingPaths.has(file)) continue;

  const extension = path.extname(filename).slice(1).toLowerCase();
  const title = titleFromFilename(filename);
  const keywords = [title.toLowerCase(), extension];
  let id = slugify(title) || `document-${created + 1}`;
  if (usedIds.has(id)) id = `${id}-${extension}`;
  while (usedIds.has(id)) id = `${id}-copy`;

  const metadata = {
    id,
    title,
    description: 'Clinical guidance file from the YG Anaesthetics library.',
    category: 'General',
    date: metadataDate,
    author: 'YG Anaesthetics',
    tags: ['general'],
    keywords,
    file
  };

  fs.writeFileSync(path.join(documentsDir, `${id}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  existingPaths.add(file);
  usedIds.add(id);
  created += 1;
}

console.log(`Created ${created} metadata file${created === 1 ? '' : 's'}.`);
