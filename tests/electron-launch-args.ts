/**
 * Shared Electron launch args for E2E tests.
 * Adds --no-sandbox and --disable-gpu when running inside Docker.
 */
import fs from 'fs'

export const isDocker = fs.existsSync('/.dockerenv') || process.env.DOCKER === 'true'

export const dockerArgs: string[] = isDocker ? ['--no-sandbox', '--disable-gpu'] : []
