import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./remove-deleted-pdf-metadata.mjs', import.meta.url));
const builder = fileURLToPath(new URL('./build-library.mjs', import.meta.url));

const run = (cwd, command, args, env = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

const setup = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-metadata-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'pdfs'));
  fs.mkdirSync(path.join(root, 'documents'));
  run(root, 'git', ['init', '-q']);
  return root;
};

const write = (root, file, value) => fs.writeFileSync(path.join(root, file), value);
const metadata = (root, name, file) =>
  write(root, `documents/${name}.json`, JSON.stringify({ id: name, file }));
const commit = (root) => {
  run(root, 'git', ['add', '-A']);
  run(root, 'git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture']);
};

test('removes metadata for committed PDF deletions and rebuilds the catalog', (t) => {
  const root = setup(t);
  write(root, 'pdfs/deleted file.PDF', 'pdf');
  write(root, 'pdfs/kept.pdf', 'pdf');
  write(root, 'pdfs/image.jpg', 'image');
  metadata(root, 'deleted', 'pdfs/deleted file.PDF');
  metadata(root, 'duplicate', 'pdfs/deleted file.PDF');
  metadata(root, 'kept', 'pdfs/kept.pdf');
  metadata(root, 'missing', 'pdfs/mistyped.pdf');
  metadata(root, 'image', 'pdfs/image.jpg');
  metadata(root, 'pending', '');
  commit(root);
  const base = run(root, 'git', ['rev-parse', 'HEAD']);
  fs.unlinkSync(path.join(root, 'pdfs/deleted file.PDF'));
  fs.unlinkSync(path.join(root, 'pdfs/image.jpg'));
  commit(root);

  run(root, 'node', [script], { PDF_DELETION_BASE: base });
  run(root, 'node', [builder]);

  assert.deepEqual(fs.readdirSync(path.join(root, 'documents')).sort(),
    ['image.json', 'kept.json', 'missing.json', 'pending.json']);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'pdfs.json'), 'utf8'));
  assert.deepEqual(catalog.map((item) => item.id), ['image', 'kept', 'missing', 'pending']);
});

test('detects local staged and unstaged deletions without removing restored PDFs', (t) => {
  const root = setup(t);
  for (const name of ['staged', 'unstaged', 'restored']) {
    write(root, `pdfs/${name}.pdf`, 'pdf');
    metadata(root, name, `pdfs/${name}.pdf`);
  }
  commit(root);
  run(root, 'git', ['rm', '-q', 'pdfs/staged.pdf', 'pdfs/restored.pdf']);
  fs.unlinkSync(path.join(root, 'pdfs/unstaged.pdf'));
  write(root, 'pdfs/restored.pdf', 'pdf');

  run(root, 'node', [script], { PDF_DELETION_BASE: '' });

  assert.deepEqual(fs.readdirSync(path.join(root, 'documents')), ['restored.json']);
});

test('detects deletions when a new branch is pushed', (t) => {
  const root = setup(t);
  write(root, 'pdfs/deleted.pdf', 'pdf');
  metadata(root, 'deleted', 'pdfs/deleted.pdf');
  commit(root);
  run(root, 'git', ['update-ref', 'refs/remotes/origin/default', 'HEAD']);
  fs.unlinkSync(path.join(root, 'pdfs/deleted.pdf'));
  commit(root);

  run(root, 'node', [script], {
    PDF_DELETION_BASE: '0000000000000000000000000000000000000000',
    PDF_DELETION_DEFAULT_BRANCH: 'default'
  });

  assert.deepEqual(fs.readdirSync(path.join(root, 'documents')), []);
});

test('leaves all metadata untouched if a metadata file is invalid', (t) => {
  const root = setup(t);
  write(root, 'pdfs/deleted.pdf', 'pdf');
  metadata(root, 'deleted', 'pdfs/deleted.pdf');
  write(root, 'documents/invalid.json', '{');
  commit(root);
  fs.unlinkSync(path.join(root, 'pdfs/deleted.pdf'));

  const result = spawnSync('node', [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PDF_DELETION_BASE: '' }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid JSON in invalid\.json/);
  assert.ok(fs.existsSync(path.join(root, 'documents/deleted.json')));
});
