// Build unificado para a Vercel:
//   public_build/                      ← páginas estáticas da Inteligência de Calls (raiz do repo)
//   public_build/operacao-assistida/   ← app Vite do módulo Operação Assistida
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const raiz = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const out = join(raiz, 'public_build')
const app = join(raiz, 'operacao-assistida')

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const f of ['index.html', 'gravador.html', 'base_conhecimento.json']) {
  if (existsSync(join(raiz, f))) cpSync(join(raiz, f), join(out, f))
}

execSync('npm run build', { cwd: app, stdio: 'inherit' })
cpSync(join(app, 'dist'), join(out, 'operacao-assistida'), { recursive: true })

console.log('✔ public_build pronto')
