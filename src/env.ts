import path from 'node:path';
import {loadEnvFile} from 'node:process';

export interface ProjectEnvOptions {
  appDir?: string;
  cwd?: string;
  envFile?: string;
}

/** Loads one optional project environment file without replacing shell values. */
export function loadProjectEnv(options: ProjectEnvOptions = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const candidates = options.envFile
    ? [path.resolve(cwd, options.envFile)]
    : [
        ...new Set([
          ...(options.appDir
            ? [path.join(path.resolve(cwd, options.appDir), '.env')]
            : []),
          path.join(cwd, '.env'),
        ]),
      ];

  for (const candidate of candidates) {
    try {
      loadEnvFile(candidate);
      return candidate;
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      if (!missing) throw error;
    }
  }

  return undefined;
}
