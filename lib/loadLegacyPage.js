import fs from 'fs/promises';
import path from 'path';

const BODY_REGEX = /<body[^>]*>([\s\S]*?)<\/body>/i;

export async function loadLegacyPage(relativePath) {
  const filePath = path.join(process.cwd(), 'legacy', relativePath);
  const html = await fs.readFile(filePath, 'utf8');

  const bodyMatch = html.match(BODY_REGEX);
  const rawBody = bodyMatch ? bodyMatch[1].trim() : html;
  const body = rawBody.replace(/<script[\s\S]*?<\/script>/gi, '');

  return { body };
}
