import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const DEFAULT_ICON_PATH = '/icon.png';
const SITE_ICON_ROUTE = '/api/site-icon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function getIconFileCandidates(filePath: string): string[] {
  if (path.isAbsolute(filePath)) {
    return [filePath];
  }

  const currentWorkingDirectory = process.cwd();
  const candidates = [path.join(currentWorkingDirectory, filePath)];
  const standaloneSuffix = `${path.sep}.next${path.sep}standalone`;

  if (currentWorkingDirectory.endsWith(standaloneSuffix)) {
    candidates.push(path.resolve(currentWorkingDirectory, '..', '..', filePath));
  }

  return [...new Set(candidates)];
}

function buildIconRedirect(request: Request, iconUrl: string): NextResponse | null {
  try {
    const origin = new URL(request.url).origin;
    const resolvedUrl = new URL(iconUrl, `${origin}/`);

    if (resolvedUrl.pathname === SITE_ICON_ROUTE) {
      console.warn('[SiteIcon] Ignoring SITE_ICON_URL because it points back to /api/site-icon.');
      return null;
    }

    return NextResponse.redirect(resolvedUrl, 307);
  } catch (error) {
    console.warn('[SiteIcon] Invalid SITE_ICON_URL:', iconUrl, error);
    return null;
  }
}

async function serveIconFile(filePath: string): Promise<Response> {
  const [fileBuffer, fileStat] = await Promise.all([
    fs.promises.readFile(filePath),
    fs.promises.stat(filePath),
  ]);
  const etag = `W/"${fileStat.size}-${Math.trunc(fileStat.mtimeMs)}"`;

  return new Response(fileBuffer, {
    headers: {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Length': String(fileStat.size),
      'Content-Type': getMimeType(filePath),
      ETag: etag,
      'Last-Modified': fileStat.mtime.toUTCString(),
    },
  });
}

export async function GET(request: Request) {
  const iconFile = process.env.SITE_ICON_FILE?.trim();

  if (iconFile) {
    const resolvedFilePaths = getIconFileCandidates(iconFile);
    let lastError: unknown = null;

    for (const resolvedFilePath of resolvedFilePaths) {
      try {
        return await serveIconFile(resolvedFilePath);
      } catch (error) {
        lastError = error;
      }
    }

    console.warn(
      `[SiteIcon] Failed to read SITE_ICON_FILE from any supported path: ${resolvedFilePaths.join(', ')}`,
      lastError,
    );
  }

  const iconUrl = process.env.SITE_ICON_URL?.trim() || process.env.NEXT_PUBLIC_SITE_ICON_URL?.trim();

  if (iconUrl) {
    const redirectResponse = buildIconRedirect(request, iconUrl);

    if (redirectResponse) {
      return redirectResponse;
    }
  }

  return NextResponse.redirect(new URL(DEFAULT_ICON_PATH, request.url), 307);
}

export const HEAD = GET;
