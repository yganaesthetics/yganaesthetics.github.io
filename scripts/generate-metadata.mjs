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

const compact = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
const ignoredKeywords = new Set(['pdf', 'jpg', 'guide', 'guideline', 'checklist', 'document', 'form', 'version']);

const termMatches = (text, term) => {
  const value = compact(text);
  const normalizedTerm = compact(term);
  const singularTerm = normalizedTerm.endsWith('ies')
    ? `${normalizedTerm.slice(0, -3)}y`
    : normalizedTerm.endsWith('s')
      ? normalizedTerm.slice(0, -1)
      : normalizedTerm;
  return normalizedTerm.length >= 3 && (value.includes(normalizedTerm) || value.includes(singularTerm));
};

const uniqueValues = (items) => [...new Set(items.filter(Boolean))];

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
const catalog = fs.existsSync(path.join(root, 'pdfs.json'))
  ? JSON.parse(fs.readFileSync(path.join(root, 'pdfs.json'), 'utf8'))
  : [];
const catalogCategories = uniqueValues(catalog.map((item) => item.category));
const catalogTags = uniqueValues(catalog.flatMap((item) => item.tags || []));

const inferClassification = (filename) => {
  const directCategories = catalogCategories.filter((category) => termMatches(filename, category));
  const directTags = catalogTags.filter((tag) => termMatches(filename, tag));
  const inheritedCategories = new Map();
  const keywordMatches = [];

  for (const item of catalog) {
    const matchedKeywords = (item.keywords || []).filter(
      (keyword) => !ignoredKeywords.has(compact(keyword)) && termMatches(filename, keyword)
    );
    if (!matchedKeywords.length) continue;

    const score = Math.max(...matchedKeywords.map((keyword) => compact(keyword).length));
    keywordMatches.push({ item, score });
    if (item.category) {
      inheritedCategories.set(item.category, (inheritedCategories.get(item.category) || 0) + score);
    }
  }

  const strongestMatch = Math.max(0, ...keywordMatches.map(({ score }) => score));
  const inheritedTags = new Set(directTags);
  for (const { item, score } of keywordMatches) {
    if (score === strongestMatch) {
      for (const tag of item.tags || []) inheritedTags.add(tag);
    }
  }

  const rankedCategories = [...inheritedCategories.entries()]
    .sort(([, firstScore], [, secondScore]) => secondScore - firstScore)
    .map(([category]) => category);
  const category = directCategories[0] || rankedCategories[0] || 'General';
  const tags = uniqueValues([
    catalogTags.includes('clinical guidance') ? 'clinical guidance' : null,
    ...directTags,
    ...inheritedTags
  ]);

  return { category, tags: tags.length ? tags : ['general'] };
};

let created = 0;

for (const filename of files) {
  const file = `pdfs/${filename}`;
  if (existingPaths.has(file)) continue;

  const extension = path.extname(filename).slice(1).toLowerCase();
  const title = titleFromFilename(filename);
  const keywords = [title.toLowerCase(), extension];
  const classification = inferClassification(filename);
  let id = slugify(title) || `document-${created + 1}`;
  if (usedIds.has(id)) id = `${id}-${extension}`;
  while (usedIds.has(id)) id = `${id}-copy`;

  const metadata = {
    id,
    title,
    description: `${classification.category} reference for ${title}.`,
    category: classification.category,
    date: metadataDate,
    author: 'YG Anaesthetics',
    tags: classification.tags,
    keywords,
    file
  };

  fs.writeFileSync(path.join(documentsDir, `${id}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  existingPaths.add(file);
  usedIds.add(id);
  created += 1;
}

console.log(`Created ${created} metadata file${created === 1 ? '' : 's'}.`);
