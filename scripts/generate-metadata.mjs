#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

const root = process.cwd();
const pdfsDir = path.join(root, 'pdfs');
const documentsDir = path.join(root, 'documents');
const metadataDate = process.env.METADATA_DATE || new Date().toISOString().slice(0, 10);
const inputDir = process.argv[2] ? path.resolve(root, process.argv[2]) : pdfsDir;
const moveProcessedFiles = inputDir !== pdfsDir;

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

const titleFromFilename = (filename) => {
  const basename = path.basename(filename, path.extname(filename));
  const withoutPrefix = basename
    .replace(/^(YG\s+CG(?:\s+CC)?\s+\d+|YGAD\s+(?:CG|OPG)\s*\d+|YG\s+ICU\s+LocSSIP(?:\s+\d+)?|LocSSIP(?:\s+\d+)?|OA\s+WCD|YG\s+CG|BCUHB|YGELP)\b\s*/i, '')
    .replace(/^for\s+/i, '');
  return withoutPrefix.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || basename;
};

const prefixTagsFromFilename = (filename) => {
  const basename = path.basename(filename, path.extname(filename));
  const prefixes = [
    /^(YG\s+CG(?:\s+CC)?\s+\d+)/i,
    /^(YGAD\s+CG\s*\d+)/i,
    /^(YG\s+ICU\s+LocSSIP(?:\s+\d+)?|LocSSIP(?:\s+\d+)?|YGAD\s+OPG\s*\d+)/i,
    /^(OA\s+WCD)/i,
    /^(YG\s+CG|BCUHB|YGELP)/i
  ];
  const match = prefixes.map((prefix) => basename.match(prefix)).find(Boolean);
  return match ? [match[1].replace(/\s+/g, ' ').trim()] : [];
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

const reviewDateFromText = (text) => {
  const match = text.match(
    /(?:review\s+date|date\s+for\s+review|date\s+of\s+next\s+review|next\s+review(?:\s+date)?)[^\dA-Za-z]{0,24}(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}[./-]\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/i
  );
  if (!match) return null;

  const value = match[1];
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const namedMonth = value.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (namedMonth) return `${namedMonth[2]}-${String(monthNames.indexOf(namedMonth[1].slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}`;

  const parts = value.split(/[./-]/).map(Number);
  if (parts.length === 2) {
    const year = parts[1] < 100 ? parts[1] + 2000 : parts[1];
    return `${year}-${String(parts[0]).padStart(2, '0')}`;
  }

  const [year, month, day] = parts[0] > 31 ? parts : [parts[2], parts[1], parts[0]];
  const fullYear = year < 100 ? year + 2000 : year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  return date.getUTCFullYear() === fullYear && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
};

const runCommand = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
};

const extractPdfText = (filePath) => {
  const text = runCommand('pdftotext', ['-f', '1', '-l', '5', '-layout', filePath, '-']);
  if (text) return text;

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'yg-pdf-'));
  const imagePrefix = path.join(temporaryDirectory, 'page');
  runCommand('pdftoppm', ['-f', '1', '-l', '5', '-png', '-r', '150', filePath, imagePrefix]);
  const pages = fs.existsSync(temporaryDirectory)
    ? fs.readdirSync(temporaryDirectory).filter((file) => file.endsWith('.png')).sort()
    : [];
  const ocrText = pages.map((page) => runCommand('tesseract', [path.join(temporaryDirectory, page), 'stdout'])).join('\n');
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  return ocrText.trim();
};

const extractAssetText = (filePath, extension) => {
  if (extension === 'pdf') return extractPdfText(filePath);
  if (extension === 'jpg') return runCommand('tesseract', [filePath, 'stdout']);
  return '';
};

const files = fs.existsSync(inputDir)
  ? fs.readdirSync(inputDir, { recursive: true })
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

const inferClassification = (sourceText) => {
  const directCategories = catalogCategories.filter((category) => termMatches(sourceText, category));
  const directTags = catalogTags.filter((tag) => termMatches(sourceText, tag));
  const inheritedCategories = new Map();
  const keywordMatches = [];

  for (const item of catalog) {
    const matchedKeywords = (item.keywords || []).filter(
      (keyword) => !ignoredKeywords.has(compact(keyword)) && termMatches(sourceText, keyword)
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

const matchingKeywords = (sourceText) =>
  uniqueValues(
    catalog
      .flatMap((item) => item.keywords || [])
      .filter((keyword) => !ignoredKeywords.has(compact(keyword)) && termMatches(sourceText, keyword))
  ).slice(0, 8);

const categoryFromSourcePath = (filename) => {
  if (!moveProcessedFiles) return null;
  const relativePath = path.relative(inputDir, path.join(inputDir, filename));
  const directory = (relativePath.split(path.sep)[0] || path.basename(inputDir)).toLowerCase();
  const inputCategory = path.basename(inputDir).toLowerCase();
  return {
    general: 'General',
    operational: 'Operational',
    obstetrics: 'Obstetrics'
  }[directory] || {
    general: 'General',
    operational: 'Operational',
    obstetrics: 'Obstetrics'
  }[inputCategory] || 'Critical Care';
};

const filesEqual = (firstPath, secondPath) => {
  const first = fs.readFileSync(firstPath);
  const second = fs.readFileSync(secondPath);
  return first.length === second.length && first.equals(second);
};

let created = 0;

for (const filename of files) {
  const sourcePath = path.join(inputDir, filename);
  const sourceFilename = path.basename(filename);
  let destinationName = sourceFilename;
  let file = `pdfs/${destinationName}`;
  const originalDestinationPath = path.join(pdfsDir, destinationName);
  if (moveProcessedFiles && fs.existsSync(originalDestinationPath)) {
    if (filesEqual(sourcePath, originalDestinationPath)) {
      fs.rmSync(sourcePath);
      continue;
    }
    const extensionWithDot = path.extname(destinationName);
    const basename = path.basename(destinationName, extensionWithDot);
    destinationName = `${basename} (Stephan)${extensionWithDot}`;
    file = `pdfs/${destinationName}`;
  }
  if (existingPaths.has(file)) continue;

  const extension = path.extname(destinationName).slice(1).toLowerCase();
  const title = titleFromFilename(sourceFilename);
  const prefixTags = prefixTagsFromFilename(sourceFilename);
  const content = extractAssetText(sourcePath, extension);
  const sourceText = `${sourceFilename}\n${title}\n${content}`;
  const keywords = uniqueValues([title.toLowerCase(), extension, ...matchingKeywords(sourceText)]);
  const classification = inferClassification(sourceText);
  const reviewDate = reviewDateFromText(content);
  const category = categoryFromSourcePath(filename) || classification.category;
  let id = slugify(title) || `document-${created + 1}`;
  if (usedIds.has(id)) id = `${id}-${extension}`;
  while (usedIds.has(id)) id = `${id}-copy`;

  const metadata = {
    id,
    title,
    description: `This document provides guidance on ${title}.`,
    category,
    date: metadataDate,
    author: 'YG Anaesthetics',
    tags: uniqueValues([...classification.tags, ...prefixTags]),
    keywords,
    file,
    reviewDate
  };

  fs.writeFileSync(path.join(documentsDir, `${id}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  if (moveProcessedFiles) fs.renameSync(sourcePath, path.join(pdfsDir, destinationName));
  existingPaths.add(file);
  usedIds.add(id);
  created += 1;
}

console.log(`Created ${created} metadata file${created === 1 ? '' : 's'}.`);
