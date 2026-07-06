import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/config.schema';
import {
  DecodedDiagramInput,
  DIAGRAM_TEMP_RETENTION_HOURS,
  DiagramInputFormat,
} from './diagram-parser.types';

interface StoredDiagramImportFile {
  fileRef: string;
  expiresAt: string;
}

const EXTENSION_BY_FORMAT: Record<DiagramInputFormat, string> = {
  mermaid: 'mmd',
  drawio: 'drawio',
  lucid_csv: 'csv',
  vsdx: 'vsdx',
};

@Injectable()
export class DiagramTempFileStore {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async store(decoded: DecodedDiagramInput, importId: string): Promise<StoredDiagramImportFile> {
    const directory = this.tempDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });

    const fileRef = `${importId}-${randomUUID()}.${EXTENSION_BY_FORMAT[decoded.detectedFormat]}`;
    const fullPath = join(directory, fileRef);

    await writeFile(fullPath, decoded.buffer, { mode: 0o600 });
    void this.cleanupExpired();

    return {
      fileRef,
      expiresAt: new Date(Date.now() + DIAGRAM_TEMP_RETENTION_HOURS * 60 * 60 * 1000).toISOString(),
    };
  }

  async cleanupExpired(now = Date.now()): Promise<number> {
    const directory = this.tempDirectory();
    let entries: string[];

    try {
      entries = await readdir(directory);
    } catch {
      return 0;
    }

    let deleted = 0;
    const maxAgeMs = DIAGRAM_TEMP_RETENTION_HOURS * 60 * 60 * 1000;

    for (const entry of entries) {
      const fileName = basename(entry);
      if (fileName !== entry) {
        continue;
      }

      const path = join(directory, fileName);
      try {
        const metadata = await stat(path);
        if (now - metadata.mtimeMs > maxAgeMs) {
          await unlink(path);
          deleted += 1;
        }
      } catch {
        // Best-effort cleanup; stale temp files are covered by the next cleanup pass.
      }
    }

    return deleted;
  }

  private tempDirectory(): string {
    return this.configService.get('DIAGRAM_TEMP_DIR', { infer: true });
  }
}
