#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const documentsDir = path.join(root, 'documents');
const deletedPaths = (args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not identify deleted PDFs: ${result.error?.message || result.stderr.trim()}`);
  }
  return result.stdout.split('\0');
};

const deletedPdfs = new Set(
  [
    ...deletedPaths(['diff', '--no-renames', '--name-only', '--diff-filter=D', '-z', 'HEAD', '--', 'pdfs/']),
    ...deletedPaths(['log', '--full-history', '-m', '--no-renames', '--name-only', '--diff-filter=D', '--format=', '-z', 'HEAD', '--', 'pdfs/'])
  ].filter((file) => /\.pdf$/i.test(file) && !fs.existsSync(path.join(root, file)))
);

if (deletedPdfs.size && fs.existsSync(documentsDir)) {
  const metadataFiles = fs.readdirSync(documentsDir)
    .filter((file) => file.endsWith('.json') && file !== 'template.json');
  const toRemove = metadataFiles.filter((file) => {
    const filePath = path.join(documentsDir, file);
    let metadata;
    try {
      metadata = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid JSON in ${file}: ${error.message}`);
    }
    return metadata && deletedPdfs.has(metadata.file);
  });

  for (const file of toRemove) {
    fs.unlinkSync(path.join(documentsDir, file));
    console.log(`Removed metadata for deleted PDF: ${file}`);
  }
}
