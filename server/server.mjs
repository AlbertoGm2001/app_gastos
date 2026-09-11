/**
 * Servidor HTTP autónomo para la API, pensado para Render (ver `render.yaml`).
 *
 * En local la API **no** pasa por aquí: va montada como middleware del dev server de Vite
 * (`vite.config.ts`), y ese sigue siendo el camino de todos los días. Este fichero existe
 * porque un servicio de Render necesita un proceso que escuche en un puerto, y monta el
 * mismísimo `createApiMiddleware`: una sola implementación de las rutas, dos formas de
 * servirla. Si algo se comporta distinto entre local y Render, no está en la lógica de la
 * API, está aquí o en el entorno.
 *
 * Sirve solo `/api/*`. El front no se despliega: sigue corriendo en local.
 */
import http from 'node:http'
import { createApiMiddleware } from './api.mjs'

const middleware = createApiMiddleware(process.env)

// Render inyecta PORT y espera que se escuche en 0.0.0.0: en 127.0.0.1 el health check
// no llega y el despliegue se marca como fallido sin más explicación.
const port = Number(process.env.PORT) || 3000
const host = process.env.HOST || '0.0.0.0'

const server = http.createServer((req, res) => {
  // `next` es lo que el dev server de Vite aporta en local (servir el front). Aquí no hay
  // front que servir, así que cualquier cosa fuera de /api es un 404 explícito y no una
  // petición que se queda colgada hasta el timeout.
  middleware(req, res, () => {
    res.statusCode = 404
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Este servicio solo sirve /api. El front corre en local.' }))
  })
})

server.listen(port, host, () => {
  console.log(`API escuchando en http://${host}:${port}`)
})

// Render manda SIGTERM y espera antes de matar el proceso. `server.close()` por sí solo
// no basta: se queda esperando a que venzan las conexiones keep-alive del navegador, y
// las del pool de Postgres mantienen el bucle de eventos vivo mientras tanto. Cortarlas a
// mano hace que el despliegue no se coma esa espera en cada push.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    server.closeAllConnections()
    // Red de seguridad: si algo sigue colgado, salir de todas formas antes de que Render
    // recurra a SIGKILL.
    setTimeout(() => process.exit(0), 5000)
  })
}
