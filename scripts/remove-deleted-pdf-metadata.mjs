#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const documentsDir = path.join(root, 'documents');
const base = process.env.PDF_DELETION_BASE;
let revisions = base ? [base, 'HEAD'] : ['HEAD'];
if (base && /^0+$/.test(base)) {
  const defaultBranch = process.env.PDF_DELETION_DEFAULT_BRANCH;
  if (!defaultBranch) throw new Error('Default branch is required to identify deletions on a new branch');
  const mergeBase = spawnSync(
    'git', ['merge-base', 'HEAD', `refs/remotes/origin/${defaultBranch}`],
    { cwd: root, encoding: 'utf8' }
  );
  if (mergeBase.error || mergeBase.status !== 0) {
    throw new Error(`Could not find the default branch merge base: ${mergeBase.error?.message || mergeBase.stderr.trim()}`);
  }
  revisions = [mergeBase.stdout.trim(), 'HEAD'];
}
const result = spawnSync(
  'git',
  ['diff', '--no-renames', '--name-only', '--diff-filter=D', '-z', ...revisions, '--', 'pdfs/'],
  { cwd: root, encoding: 'utf8' }
);

if (result.error || result.status !== 0) {
  throw new Error(`Could not identify deleted PDFs: ${result.error?.message || result.stderr.trim()}`);
}

const deletedPdfs = new Set(
  result.stdout.split('\0').filter((file) => /\.pdf$/i.test(file) && !fs.existsSync(path.join(root, file)))
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
