import {loadEnvFile} from 'node:process';

/** Loads an optional .env file from the current working directory. */
export function loadDotEnv(path = '.env') {
  try {
    loadEnvFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  }
}
