import { app } from 'electron'
import { join } from 'node:path'

// Data root: override with OAP_DATA_DIR (useful in dev), otherwise the userData dir.
function resolveDataRoot(): string {
  const override = process.env['OAP_DATA_DIR']
  if (override) return override
  return join(app.getPath('userData'), 'oap')
}

export const DATA_ROOT = resolveDataRoot()
export const DB_PATH = join(DATA_ROOT, 'oap.db')
export const SANDBOXES_ROOT = join(DATA_ROOT, 'sandboxes')
