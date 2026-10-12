#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const documentsDir = path.join(root, 'documents');
const outputPath = path.join(root, 'pdfs.json');

const files = fs.existsSync(documentsDir)
  ? fs.readdirSync(documentsDir)
      .filter((file) => file.endsWith('.json') && file !== 'template.json')
      .sort()
  : [];

if (!files.length) {
  fs.writeFileSync(outputPath, '[]\n');
  console.log('No document metadata files found. Wrote empty pdfs.json');
  process.exit(0);
}

const documents = files
  .map((file) => {
    const filePath = path.join(documentsDir, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON in ${file}: ${error.message}`);
    }
  })
  .filter(Boolean);

fs.writeFileSync(outputPath, `${JSON.stringify(documents, null, 2)}\n`);
console.log(`Built ${documents.length} PDF entries into pdfs.json`);
