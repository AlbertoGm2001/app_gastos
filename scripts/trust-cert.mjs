/**
 * Instala la CA local de mkcert en el almacén de confianza del usuario, para que el
 * navegador acepte https://localhost:5173 sin avisos.
 *
 *   npm run cert:trust           # instala la CA (Windows abre un diálogo: acepta)
 *   npm run cert:trust -- --check  # solo comprueba que mkcert está localizable
 *
 * Hace falta porque Enable Banking rechaza las redirect URL en http:// para
 * aplicaciones de producción, así que el dev server tiene que servir en HTTPS.
 *
 * El binario se busca primero en el PATH y luego donde lo deja winget, que añade el
 * alias al PATH pero solo surte efecto en una terminal nueva.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

function findMkcert() {
  const candidates = [
    'mkcert',
    path.join(
      process.env.LOCALAPPDATA ?? '',
      'Microsoft',
      'WinGet',
      'Packages',
      'FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'mkcert.exe',
    ),
  ]
  for (const candidate of candidates) {
    try {
      const version = execFileSync(candidate, ['-version'], { encoding: 'utf8' }).trim()
      return { bin: candidate, version }
    } catch {
      // Siguiente candidato.
    }
  }
  return null
}

const found = findMkcert()
if (!found) {
  console.error('No se encuentra mkcert. Instálalo con:  winget install FiloSottile.mkcert')
  process.exit(1)
}
console.log(`mkcert ${found.version} en ${found.bin}`)

if (process.argv.includes('--check')) {
  const certDir = path.resolve(import.meta.dirname, '..', '.certs')
  const files = fs.existsSync(certDir) ? fs.readdirSync(certDir) : []
  console.log(files.length > 0 ? `certificados en .certs/: ${files.join(', ')}` : 'no hay certificados en .certs/')
  process.exit(0)
}

// Windows muestra un diálogo de seguridad al añadir la CA al almacén raíz del usuario.
console.log('Instalando la CA local. Si Windows pide confirmación, acéptala.')
execFileSync(found.bin, ['-install'], { stdio: 'inherit' })
console.log('Listo. Reinicia el navegador y https://localhost:5173 dejará de dar aviso.')
