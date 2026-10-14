import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

/** A portable copy of the reliability lab's public HTML layout. */
export async function reliabilityFixture(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-reliability-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'public'));
  await fs.writeFile(path.join(root, 'public', 'index.html'), '<html><body>Home</body></html>');
  for (let i = 1; i <= 37; i++) {
    await fs.writeFile(path.join(root, 'public', `page-${String(i).padStart(2, '0')}.html`), '<html><body>Page</body></html>');
  }
  return root;
}
