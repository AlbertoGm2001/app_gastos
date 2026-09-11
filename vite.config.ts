import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type ServerOptions } from 'vite'
// @ts-expect-error -- server/ es JavaScript plano de Node, sin tipos.
import { createApiMiddleware } from './server/api.mjs'

/**
 * Monta la API local (Enable Banking + Postgres) dentro del propio dev server.
 * La clave privada y la cadena de conexión se quedan en Node: el navegador solo ve /api.
 */
function localApi(env: Record<string, string>): Plugin {
  return {
    name: 'app-gastos-local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createApiMiddleware(env))
    },
  }
}

const CERT_DIR = path.resolve(import.meta.dirname, '.certs')
const CERT = path.join(CERT_DIR, 'localhost+1.pem')
const KEY = path.join(CERT_DIR, 'localhost+1-key.pem')

/**
 * TLS local. Enable Banking rechaza las redirect URL en `http://` para aplicaciones de
 * producción ("unsupported scheme"), así que el dev server tiene que servir en HTTPS
 * para poder recibir el retorno del banco tras el SCA.
 *
 * Los certificados se generan con mkcert y no están en el repo (`.certs/` ignorado):
 *   mkcert localhost 127.0.0.1     # dentro de .certs/
 *   npm run cert:trust             # instala la CA local, quita el aviso del navegador
 *
 * Sin certificados el servidor arranca en HTTP, que basta para el sandbox.
 */
function httpsOptions(): ServerOptions['https'] {
  if (!fs.existsSync(CERT) || !fs.existsSync(KEY)) return undefined
  return { cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY) }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefijo '' para leer también las variables sin VITE_, que solo usa el servidor.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), localApi(env)],
    server: {
      port: 5173,
      // Si el puerto está ocupado, fallar en vez de saltar a otro: la redirect URL
      // registrada en Enable Banking apunta a 5173 y solo funciona ahí.
      strictPort: true,
      https: httpsOptions(),
    },
  }
})
