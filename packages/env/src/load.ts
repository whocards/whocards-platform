import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url))

// Never overrides: values from a `with-env` wrapper (e.g. ENV=prod's .env.prod) win.
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)
