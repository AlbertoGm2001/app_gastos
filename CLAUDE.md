# app_gastos

App de control de gasto personal sobre las cuentas del Santander. React 19 + Vite + Tailwind 4. **Todo vive
en Postgres** —movimientos y estado del usuario— y lo lee una API local montada dentro del dev server de
Vite. En localStorage solo queda una caché de arranque (`gastos.userState`), nunca la fuente de verdad.

**Ningún dato bancario real entra en el repo.** El extracto `.xls` y la base de datos quedan fuera: el
extracto lleva importes, comercios y nombres completos de terceros (Bizum de amigos y familia). `.gitignore`
cubre `transactions_*.xls`, `.env.local` y `*.pem`. No crear ficheros de datos dentro de `src/`.

## System prompt de categorización — REGLA PERMANENTE

`src/lib/systemPrompt.ts` contiene `DEFAULT_SYSTEM_PROMPT`: el contexto que se lee **antes** de clasificar
cualquier movimiento. Es editable por el usuario en **Configuración → System prompt de categorización** y se
guarda en localStorage (`gastos.systemPrompt`).

**Cada vez que aprendas algo específico de la situación del usuario, añádelo a ese prompt.** No lo dejes solo
en el código, en un comentario ni en la conversación: el prompt es el único sitio donde ese conocimiento se
acumula y desde donde se aplica. Ejemplos de cosas que van ahí: que tiene coche eléctrico, qué deportes
practica, qué transferencias son ahorro y no gasto, qué comercios recurrentes corresponden a qué categoría.

Formato del prompt:

- Prosa libre para el contexto personal (sección `CONTEXTO PERSONAL`).
- Líneas de regla en la sección `REGLAS`, con el formato exacto:

  ```
  - palabra, otra palabra -> Nombre de categoría
  ```

  Estas líneas las aplica hoy el clasificador de `src/lib/categorize.ts` **con prioridad sobre las palabras
  clave** de cada categoría. El nombre de categoría debe coincidir con una existente; si no, la regla se
  ignora en silencio.

Cuando se conecte la IA real, el prompt completo se le pasará como system prompt. Por eso el texto debe
seguir siendo legible para un modelo, no solo parseable.

Reglas ya aprendidas y recogidas en el prompt:

- **Coche eléctrico**: no reposta a diario, así que gasolineras y peajes pertenecen a un viaje puntual. Por eso
  `src/lib/categories.ts` no lleva keywords de combustible en *Coche y transporte*.
- **Los viajes no son una categoría**: se dan de alta por fechas en la pestaña **Viajes** y todo lo que caiga
  en su rango —gastos e ingresos— se asigna a ese viaje.
- **Bizum y transferencias no tienen categoría propia**: sin más contexto en el concepto, quedan sin categorizar.
- **Inversión y ahorro** (`excludeFromSpending: true`): las transferencias a su propio nombre —con concepto de
  ahorro/inversión o simples traspasos entre cuentas propias— no son gasto y quedan fuera de los agregados.
- **El gasto por categoría es NETO**: los ingresos de una categoría restan de su gasto, porque casi siempre
  son reembolsos (Bizum de amigos al repartir, devoluciones). Por eso todo ingreso que NO compense un gasto
  —nómina, traspasos propios— debe caer en una categoría con `excludeFromSpending: true`, o falsearía el gasto
  de la suya. Es la razón de ser de *Nómina e ingresos*.

## Objetivo de gasto mensual

`src/lib/goal.ts`. El Panel se organiza alrededor de un techo de gasto mensual (`monthlyGoal` en `app_state`,
editable en Configuración). El Panel arranca filtrado por el mes en curso; con un mes seleccionado, el gráfico
de evolución se sustituye por barras horizontales por categoría con el límite de gasto fijo (`fixedBudget`,
guardado dentro de `app_state.categories`) marcado con una línea discontinua. Sin filtro de mes vuelve la
evolución histórica.

**Qué cuenta como "relevante" lo decide solo `isSignificant(amount, threshold)`** (`Math.abs(amount) >
threshold`, en magnitud: interesan los movimientos grandes, sean cargos o abonos). Lo usan el aviso de
descategorizados del Panel y el filtro *Significativos* de Movimientos; el umbral es `relevantThreshold`. No
duplicar la comparación en cada sitio: si discrepan, la app avisa de un movimiento que su propio filtro no
muestra.

## Viajes

`src/lib/trips.ts`. Un `Trip` es `{ id, name, start, end }` y se guarda en localStorage (`gastos.trips`).
`tripsAsCategories()` los expone como categorías virtuales con id `trip:<id>`, de modo que panel, gráficos y
desplegables los tratan como una categoría más sin saber nada de viajes. En `src/lib/categorize.ts` el viaje
gana a las reglas y a las palabras clave; solo lo sobreescribe una reclasificación manual. No se admiten
viajes con fechas solapadas: un movimiento pertenece como mucho a un viaje.

## Conexión bancaria (Enable Banking + Postgres)

Los movimientos se traen del banco por PSD2 con **Enable Banking** y se guardan en **Postgres**. El frontend
se despliega en Vercel, la API en Render y la base de datos en Neon. En local sigue corriendo todo junto con
`npm run dev`, que es el camino de todos los días.

Hoy la base de datos es un **Postgres 17 en Docker** (contenedor `app_gastos_pg`, puerto **5434** — 5432 y 5433
ya los ocupan otros proyectos), sembrado con el histórico del extracto. Se usa el driver `pg` estándar, así que
migrar a Neon es cambiar `DATABASE_URL` en `.env.local` y nada más: el TLS se activa solo al detectar
`sslmode=require` o un host `neon.tech`.

**El esquema no se crea a mano, ni hay ficheros de migración SQL.** `ensureSchema()` en `server/db.mjs` es
DDL idempotente (`create table if not exists`) y `server/api.mjs` la ejecuta una vez, de forma perezosa, en
la primera petición. Una base de datos vacía —un proyecto de Neon recién creado— queda montada sola al
apuntarle `DATABASE_URL` y abrir la app; `npm run db:schema` hace lo mismo por adelantado y lista las tablas
resultantes. Los datos son otra cosa: el histórico del extracto **no se puede volver a descargar** (la API
del banco corta a ~90 días), así que al cambiar de base de datos hay que copiarlo, con `pg_dump` del
contenedor local o reimportando el `.xls` con `npm run db:import`.

**Usar el endpoint directo de Neon, no el agrupado — REGLA PERMANENTE.** Neon da dos cadenas de conexión y
la que enseña por defecto es la del host con `-pooler`: un PgBouncer en modo transacción. Ahí el estado de
sesión no es tuyo —reparte una conexión de servidor por transacción—, y eso rompe el `search_path`:

- El síntoma es `relation "bank_transactions" does not exist` contra una base de datos que **sí** tiene la
  tabla y los datos, de forma intermitente, y con el endpoint directo funcionando a la vez.
- La causa de que aparezca: `pg_dump` emite `set_config('search_path','')` al principio de sus volcados, así
  que **restaurar un volcado con `psql` contra el pooler deja ese `search_path` vacío pegado** a una conexión
  de servidor, y lo hereda el siguiente cliente que la reutilice.
- **Un `set search_path` al conectar no lo arregla, aunque lo parezca.** Por el pooler el `set` puede acabar
  en una conexión de servidor distinta de la que sirve luego la consulta. Medido: 60 consultas concurrentes
  por el pooler devuelven dos valores distintos de `current_setting('search_path')`; por el endpoint directo,
  siempre el mismo. Se intentó ese parche y se retiró: mitigaba lo justo para dar confianza falsa.
- Tampoco vale ponerlo en la cadena (`options=-c search_path=...`): el pooler lo rechaza con
  `unsupported startup parameter in options`.

El pooler está pensado para funciones serverless que abren y cierran miles de conexiones efímeras. Esto es un
proceso largo con un pool de 4 conexiones, que es justo el caso del endpoint directo. `createPool()` en
`server/db.mjs` avisa por consola si detecta `-pooler` en la cadena.

La API de Enable Banking exige firmar cada petición con un JWT RS256 hecho con una clave privada RSA, y no
sirve CORS. Por eso hay una **API local montada como middleware del dev server de Vite** (`vite.config.ts` →
`server/api.mjs`): la clave y la cadena de Neon se quedan en Node y todo sigue arrancando con `npm run dev`.
En local no hay ningún proceso servidor aparte, y para el desarrollo del día a día no debe añadirse uno.

**La excepción es el despliegue** (`render.yaml` + `server/server.mjs`): un servicio de Render necesita un
proceso que escuche en un puerto. `server/server.mjs` no reimplementa nada —monta el mismo
`createApiMiddleware`— y solo sirve `/api`. Una sola implementación de las rutas, dos formas de servirla: si
algo se comporta distinto entre local y Render, está en el entorno o en ese envoltorio, nunca en la lógica de
la API. Ver *Despliegue de la API en Render* más abajo.

### HTTPS en local, obligatorio en producción

Enable Banking **rechaza las redirect URL en `http://`** para aplicaciones de producción
(`Url http://... has unsupported scheme`). El dev server sirve por tanto en **HTTPS**:
`vite.config.ts` carga los certificados de `.certs/` si existen, y si no arranca en HTTP (suficiente para
sandbox). El puerto es fijo (`strictPort: true`) porque la redirect URL registrada apunta a 5173 y solo
funciona ahí.

Los certificados se generan con [mkcert](https://github.com/FiloSottile/mkcert) y **no están en el repo**
(`.certs/` ignorado, contienen la clave privada):

```bash
cd .certs && mkcert localhost 127.0.0.1   # genera el par
npm run cert:trust                         # instala la CA local (Windows pide confirmación)
```

Sin `cert:trust` todo funciona igual, pero el navegador avisa de certificado no fiable y hay que aceptar
la excepción a mano una vez.

**El cambio de HTTP a HTTPS dejó varado el localStorage anterior.** `localStorage` es por origen, y
`http://localhost:5173` y `https://localhost:5173` son orígenes distintos: al pasar a HTTPS la app empezó a
leer un almacenamiento vacío y sembró las categorías por defecto y `gastos.trips` a `[]`. Los datos viejos
siguen ahí, en el origen `http://`, no borrados. Si el usuario dice que ha perdido viajes, categorías o
ajustes, **esto es lo primero que hay que descartar**, antes de buscar la causa en el código: se recuperan
abriendo `http://localhost:5173` (o leyendo los `.ldb` del perfil de Chrome) y copiando los valores al origen
HTTPS. Ojo también con los arranques en 5174/5175 cuando el puerto estaba ocupado: cada uno tiene su propio
almacenamiento.

Flujo: *Configuración → Conexión bancaria* → **Elegir banco** (`GET /api/bank/aspsps`) → **Autorizar en el
banco** (`POST /api/bank/connect` devuelve la URL del SCA) → el banco redirige a `/api/bank/callback`, que
canjea el `code` por una sesión y vuelve a `/?eb=ok` → **Sincronizar movimientos** (`POST /api/bank/sync`)
lee del banco, reemplaza el tramo en Postgres y devuelve el dataset completo.

Se sincroniza desde dos sitios, y la diferencia es el `dateFrom`:

- **Panel** (`src/components/SyncMovementsCard.tsx`): con selector de fecha. Por defecto el día siguiente al
  último movimiento guardado —acotado a hoy, porque una fecha futura no la acepta ni el input ni el servidor—
  y en letra pequeña cuántos días llevas sin movimientos. Es el camino rápido para tapar el hueco.
- **Configuración → Conexión bancaria**: sin fecha, o sea la ventana máxima de histórico. Es el camino
  seguro, porque re-pide los pendientes y los consolida.

`validateDateFrom()` comprueba el formato y que la fecha caiga entre el horizonte del banco y hoy **antes** de
llamar a la API: con solo 4 accesos al día, gastar uno en un 422 por una fecha mal puesta es caro.

**Ojo con sincronizar solo desde el último movimiento:** deja fuera los pendientes anteriores a esa fecha, y
un pendiente que se consolida cambia de concepto, importe y hasta de fecha. Si eso ocurre fuera del tramo que
se reemplaza, entra como movimiento nuevo en vez de actualizar al viejo. La tarjeta del Panel avisa de esto
cuando la fecha elegida es posterior al último movimiento.

Detalles que no son obvios:

- **El signo del importe**: el banco manda el importe siempre positivo y el signo lo da
  `credit_debit_indicator` (`DBIT` = cargo). Al contrario que el extracto .xls.
- **El histórico del banco llega a ~90 días.** Más atrás la API responde
  `422 Wrong transactions period requested`. Por eso el extracto sigue siendo imprescindible: los meses
  anteriores solo existen ahí y no se pueden volver a descargar.
- **Solo 4 accesos al día por consentimiento.** Pasarse devuelve
  `429 [HUB046] Allowed number of accesses exceeded for consent` y no se recupera hasta el día siguiente. Es
  el límite PSD2 para accesos sin SCA. Cada sync gasta un acceso por cuenta: no sincronizar en bucle ni
  sondear la API a mano.
- **Las reclasificaciones manuales están en `transaction_categories`**, tabla aparte y no una columna de
  `bank_transactions`: la sync reemplaza tramos enteros de esa tabla y una columna se borraría en cada sync.
- **Se guarda la respuesta cruda** del banco en la columna `raw` (jsonb) para poder re-mapear conceptos sin
  volver a llamar a la API.
- **El consentimiento caduca** y renovarlo exige otro SCA; el máximo lo fija cada banco (`maximumConsentValidity`,
  180 días en los ASPSP españoles del sandbox). **La sesión del consentimiento vive en Postgres**
  (`app_state`, clave `bankSession`), no en un fichero: ver *El consentimiento va en la base de datos* más
  abajo.
- **En sandbox no hay Santander**: la app solo ve *Banco de Sabadell*, *BBVA* y *Mock ASPSP*. Para el Santander
  real hay que pedir acceso a producción (linked accounts) en el Control Panel.
- **El histórico del extracto y lo del banco conviven** en la misma tabla, distinguidos por la columna
  `source` (`'statement'` / `'bank'`). Ver *Deduplicación* más abajo.
- **La app siembra desde la base de datos**, no desde el código: `App.tsx` llama a `GET /api/transactions` al
  arrancar y fusiona con localStorage. Las páginas no se montan hasta que esa carga termina, porque el Panel
  inicializa su mes seleccionado a partir de la última fecha con datos.
- **La importación manual del extracto sigue viva** como respaldo, y ahora sube a la base de datos
  (`POST /api/transactions/import`) en vez de quedarse en el navegador.

Configuración en `.env.local` (plantilla en `.env.local.example`): `ENABLE_BANKING_APPLICATION_ID`, la clave
privada —`ENABLE_BANKING_KEY_PATH` (ruta al `.pem`, lo cómodo en local) o `ENABLE_BANKING_PRIVATE_KEY` (el
PEM entero, para desplegar), y si están las dos gana la variable—, `ENABLE_BANKING_REDIRECT_URL` (debe estar
en la whitelist del Control Panel) y `DATABASE_URL`.

### Qué autentica cada petición: tres piezas con tres papeles distintos

Es la parte que más se confunde, porque "credenciales del banco" suena a una sola cosa y en realidad son
tres, cada una con su sitio y su caducidad. Enable Banking **no tiene `client_secret` ni endpoint de token**:
el JWT lo emite y lo firma la propia app.

| Pieza | Para qué sirve | Dónde vive | Caduca |
| --- | --- | --- | --- |
| `application_id` | Es el `kid` del JWT: le dice a Enable Banking con qué clave pública verificar la firma. **No es secreto**, viaja en claro en cada token | Variable de entorno | No |
| Clave privada RSA | Firmar el JWT. **Es la única credencial de verdad** | Fichero `.pem` en local, `ENABLE_BANKING_PRIVATE_KEY` en el despliegue | No |
| `uid` de cuenta | Formar la URL: dice **qué** cuenta se pide | Postgres, puesto ahí por el SCA | Con el consentimiento |

Dos cosas que no son obvias y que conviene no volver a mezclar:

- **La firma no cubre la petición.** El JWT lleva solo `{iss, aud, iat, exp}`: ni la ruta, ni el método, ni el
  cuerpo. Es un bearer token normal, se cachea una hora (`cached` en `server/enablebanking.mjs`) y el mismo
  token sirve para todas las llamadas de una sync, cada una con su `uid` y su página. Si la firma dependiera
  de la petición, ese cacheo sería imposible. La contrapartida: ese token, si se filtrara, valdría para
  cualquier llamada hasta caducar; por eso vive solo en memoria y no se escribe en ningún log.
- **El `uid` no entra en la firma, entra en la URL.** Son las dos mitades independientes de la misma
  petición: `GET /accounts/<uid>/transactions?date_from=…` con `Authorization: Bearer <jwt>`. Se puede firmar
  sin haber leído la base de datos —es lo que hace `GET /api/bank/aspsps`, que lista bancos sin
  consentimiento ninguno— y por eso el `uid` es lo único del consentimiento imprescindible en cada sync.

El `sessionId`, en cambio, **apenas se usa**: en el código solo sirve para responder "hay conexión" y para
comprobar que existe antes de sincronizar. Nunca viaja al banco. Su único uso contra la API es
`getSession()`, para preguntar si el consentimiento sigue vivo (ver abajo).

### Comprobar que el consentimiento sigue vivo

Un consentimiento **se puede revocar desde la banca online del banco**, y de eso la app no se enteraría:
`validUntil` seguiría en el futuro y el estado diría "conectado" hasta que fallara una sincronización — el
peor momento para descubrirlo, porque puede costar uno de los 4 accesos diarios.

`GET /api/bank/status?verify=1` lo comprueba contra `GET /sessions/{id}` y refresca `validUntil` y las
cuentas con lo que diga la API. Las cautelas no son decorativas:

- **Solo con `?verify`,** desde el botón *Comprobar* de la tarjeta de Configuración. Nunca al montar la
  tarjeta, ni en `GET /api/bank/status` a secas, que es lo que pide el Panel al cargar.
- **Como mucho una comprobación cada 6 horas** (`VERIFY_EVERY_MS`), lo que en la interpretación más pesimista
  son 4 al día y no más. Motivo: la referencia de Enable Banking sitúa `GET /sessions/{id}` fuera de
  *Accounts data* —es su propio registro, no una consulta al banco— pero **no dice que no cuente** para el
  límite de accesos, y gastarlos a ciegas es caro porque no se recuperan hasta el día siguiente.
- **Un fallo de red no es una revocación.** Solo se marca `revoked: true` si la API responde
  `CLOSED_SESSION`, `SESSION_NOT_FOUND` o un 401/403/404; cualquier otro error deja el estado intacto y se
  informa por separado en `verifyError`. Confundirlos mandaría al usuario a repetir un SCA innecesario.
- **`expiresInDays` lo calcula el servidor**, no el cliente. El aviso de caducidad no debe depender del reloj
  del navegador. Antes `BankConnectionCard` restaba la fecha por su cuenta y las dos cuentas podían discrepar.

### El consentimiento va en la base de datos — REGLA PERMANENTE

La sesión de Enable Banking (`server/session.mjs`) se guarda en `app_state` bajo la clave `bankSession`.
Estuvo en `.enablebanking/session.json` y se movió al desplegar, por una razón concreta: el sistema de
ficheros de un servicio alojado es efímero —se pierde en cada despliegue y cada vez que el servicio se
duerme— y conservarlo obligaba a pagar un disco persistente. Y un consentimiento perdido no se regenera
solo: hay que repetir el SCA en el banco a mano.

Esto **no contradice** la regla de que en la base de datos van datos y no credenciales. Lo que se guarda es
el `sessionId` (una referencia opaca al consentimiento que custodia Enable Banking), las fechas y el objeto
de cuenta tal cual lo devolvió la API: `uid`, nombre, divisa, hashes de identificación y **el IBAN**. La
única credencial es la clave privada RSA, que sigue solo en el entorno del proceso: cada petición al banco se
firma con ella, así que sin la clave ni el `sessionId` ni el IBAN abren nada.

Ninguno de esos identificadores se calcula ni se deriva de nada nuestro: los acuña Enable Banking y solo
significan algo contra sus registros. La asociación con la cuenta real se estableció **en el banco**, durante
el SCA, y vive en los sistemas del Santander y de Enable Banking; aquí solo queda el asa para agarrarla.

- Está **deliberadamente fuera de `STATE_KEYS`**: `PUT /api/state` no puede tocarla, y `GET /api/state` no la
  devuelve. Si algún día se añade a la lista blanca, el navegador podría reescribir o leer el consentimiento.
- `readSession()` **lee el fichero antiguo una única vez** y lo sube a la base de datos, para no perder una
  conexión ya establecida. Solo lee: nunca vuelve a escribir en disco.
- Las rutas del banco hacen `await withSchema()` **antes** de leer la sesión. Cuando estaba en un fichero no
  hacía falta; ahora una base de datos sin tablas daría un error en `GET /api/bank/status`, que es justo la
  ruta que tiene que poder informar de que la base de datos no está lista.

### Despliegue de la API en Render

`render.yaml` describe un Blueprint con un único servicio web que sirve **solo la API**; el front va en Vercel
y la base de datos en Neon. Está escrito pero **no desplegado** todavía.

- `buildCommand: npm ci --omit=dev` vale porque `server/` no importa más que `pg` y módulos de Node. Si
  algún día importa algo de `devDependencies`, el build romperá en Render y no en local.
- `healthCheckPath: /api/auth/session` es la única ruta pública que no toca Postgres ni el banco. Con una
  ruta protegida el health check daría 401 y Render reiniciaría el servicio en bucle; con `/api/bank/status`
  gastaría accesos al banco, que son 4 al día.
- **Cabe en el plan gratuito porque el servicio no escribe nada en disco — REGLA PERMANENTE.** Los discos de
  Render exigen plan pagado, y eran lo único que forzaba el gasto. Dos decisiones lo evitan: el consentimiento
  está en Postgres (ver arriba) y la clave privada llega en `ENABLE_BANKING_PRIVATE_KEY`, el PEM entero como
  valor, sin Secret File ni fichero. Si el panel no admite valores multilínea, los saltos se pueden escribir
  como `\n` y `readPrivateKey()` los convierte. **Cualquier cosa nueva que quiera escribir un fichero rompe
  esto**: el disco volvería a hacer falta y con él el plan pagado.
- **El plan gratuito duerme el servicio** tras 15 minutos sin tráfico: la primera petición después tarda en
  despertar. No se pierde nada al dormirse, pero el bloqueo por intentos de login vive en memoria del proceso
  (`server/auth.mjs`) y se reinicia en cada arranque en frío, así que el contador de fuerza bruta se pone a
  cero. La contraseña sigue siendo obligatoria; si eso llega a molestar, el bloqueo tendría que ir a Postgres.
- `ENABLE_BANKING_REDIRECT_URL` apunta al dominio de **Vercel**, no al de Render, y tiene que estar en la
  whitelist del Control Panel. Se deja `sync: false` porque el dominio no se conoce hasta que existe.
- Conviene fijar `AUTH_SECRET` (aquí `generateValue: true`), al contrario que en local: si se deriva de las
  credenciales, cambiar la contraseña cierra las sesiones abiertas.

### El front en Vercel y el CORS — REGLA PERMANENTE

**No hay CORS en esta app, y es a propósito.** El front desplegado en Vercel no llama a Render: `vercel.json`
reenvía `/api/:path*` al servicio de Render, así que el navegador solo habla con el dominio de Vercel y todas
las peticiones son del mismo origen. Ninguna cabecera CORS, ningún preflight, y el código del front no
necesita saber dónde vive la API: las rutas siguen siendo relativas (`/api/state`), igual que en local.

Lo que se evita con esto no es teclear cuatro cabeceras, es un cambio de seguridad: llamar a Render directo
obligaría a bajar la cookie de sesión a `SameSite=None`, y `SameSite=Lax` está puesto porque el banco
devuelve al usuario a `/api/bank/callback` con una navegación de nivel superior (ver la sección de acceso).
Con el proxy esa navegación aterriza en el dominio de Vercel, que es el mismo sitio que puso la cookie, y
`Lax` la deja pasar. Por eso **`ENABLE_BANKING_REDIRECT_URL` apunta al dominio de Vercel, no al de Render**.

Detalles que no son obvios:

- **El orden de los `rewrites` importa.** La regla del proxy va antes que la de la SPA; al revés,
  `/((?!api/).*)` no la taparía por la negación, pero cualquier retoque de esa expresión sí, y el síntoma
  serían llamadas a la API devolviendo el `index.html`.
- **`vercel.json` no admite comentarios ni claves de más.** Su esquema declara `additionalProperties: false`,
  así que un `"comment"` dentro de un rewrite —tentador, siendo JSON— hace fallar el despliegue entero. La
  explicación va aquí, no ahí.
- **El destino del proxy va escrito a mano** porque `vercel.json` no interpola variables de entorno. Si el
  servicio de Render acaba con otro subdominio, hay que cambiarlo en `vercel.json`.
- **La app pasa a ser accesible desde internet.** Hasta ahora el único candado era que corría en localhost;
  ahora lo es de verdad `server/auth.mjs`: un usuario, contraseña del entorno y bloqueo de 60 s tras 5
  intentos. Ese bloqueo vive en memoria del proceso, así que solo cuenta bien con una única instancia de
  Render. `vercel.json` manda además `X-Robots-Tag: noindex, nofollow`, que evita que aparezca en buscadores
  pero no es una medida de acceso.

## Acceso a la app — REGLA PERMANENTE

`server/auth.mjs`, `src/lib/auth.ts`, `src/components/AuthGate.tsx`. Un único usuario, definido **solo en el
entorno del servidor**: `AUTH_USERNAME` y `AUTH_PASSWORD` en `.env.local`. No hay tabla de usuarios, ni
registro, ni recuperación de contraseña: la app es de una persona.

- **Es fail-closed.** Sin las dos variables puestas, toda la API responde `503` con el mensaje de
  `AUTH_NOT_CONFIGURED`. No cae en "modo abierto", que es lo que convertiría un despliegue al que se le olvidó
  el entorno en un extracto bancario público. Añadir un modo sin autenticación anula el sentido de esto.
- **Las credenciales no viajan nunca al navegador.** El único sitio donde `AUTH_PASSWORD` se lee es el proceso
  de Node; `GET /api/auth/session` solo dice si hay sesión y si el servidor está configurado. Nada de
  `VITE_`: cualquier variable con ese prefijo acaba dentro del bundle, en texto claro.
- **La sesión es una cookie firmada, sin estado en el servidor.** `HttpOnly` (el JS de la página no la lee),
  `SameSite=Lax` y `Secure` cuando la petición llega por HTTPS. Firmada con HMAC-SHA256 y con la caducidad
  dentro del payload firmado, 30 días.
- **`SameSite=Lax` no es un descuido, es un requisito.** El banco devuelve al usuario a
  `/api/bank/callback` con una navegación de nivel superior, y esa ruta está detrás del guard: con `Strict`
  la cookie no se enviaría y todo SCA acabaría en un 401. Si esa ruta deja de ser un redirect del banco,
  revisar esto.
- **La clave de firma se deriva de las credenciales** si no hay `AUTH_SECRET`, así que cambiar la contraseña
  invalida por sí solo las sesiones abiertas. Poniendo `AUTH_SECRET` las sesiones sobreviven al cambio.
- **Las comparaciones son en tiempo constante** (`timingSafeEqual` sobre digest, no sobre las cadenas: así la
  longitud tampoco se filtra) y usuario y contraseña se comprueban **las dos siempre**, sin cortocircuito —un
  `&&` revelaría por tiempo si el nombre de usuario existe. El mensaje de error es el mismo para los dos
  casos, por lo mismo. Y hay bloqueo de 60 s tras 5 intentos fallidos, en memoria del proceso.
- **`AuthGate` envuelve a `<App />` en `main.tsx`, no va dentro de App.** App pide movimientos y estado en sus
  efectos de montaje y esas rutas dan 401 sin sesión: montarlo antes de entrar arrancaría la app con dos
  errores de carga ya en pantalla.
- Las únicas rutas públicas son `PUBLIC_ROUTES` en `server/api.mjs`: las tres de `/api/auth/`. Cualquier ruta
  nueva queda protegida por omisión, que es el sentido de la lista blanca.

## Deduplicación — REGLA PERMANENTE

**Un movimiento se identifica por su contenido, nunca por el id que dé la fuente.**
`server/dedupKey.mjs` (y su espejo para el navegador, `src/lib/dedup.ts`) define la identidad como
`fecha + importe + concepto normalizado + nº de ocurrencia`, y de ahí sale el id:
`<eb|stmt|local>-<fecha>-<hash12>-<ocurrencia>`.

Por qué, y qué no volver a hacer:

- **`entry_reference` del Santander es posicional**, `fecha.índice-dentro-del-día` (`"2026-08-20.1"`), y
  `transaction_id` viene a `null`. En cuanto el banco reordena un día o consolida un pendiente e inserta una
  fila en medio, todos los índices posteriores se desplazan. Usarlo como clave primaria duplicaba movimientos
  y hacía perder las reclasificaciones manuales, que van indexadas por id en localStorage.
- **La ocurrencia no es opcional.** Hay duplicados legítimos: dos peajes iguales el mismo día, dos recibos del
  club de pádel. Cualquier dedup que use un `Set` de claves se los come. Es una diferencia de
  **multiconjuntos** (`subtractExisting()` en `src/lib/dedup.ts`).
- **Normalizar el concepto es obligatorio** para cruzar fuentes: el .xls escribe `"Pago Movil En Moeve"` y la
  API `"PAGO MOVIL EN MOEVE"`. Mayúsculas, sin acentos, sin puntuación.
- **La sync reemplaza tramos, no hace upsert por id** (`replaceBankRange()`). El banco es autoritativo sobre
  un día completo, así que borrar el tramo y reinsertar es lo único idempotente de verdad. Se pide siempre la
  ventana máxima (89 días): cuesta el mismo acceso que una ventana corta y elimina la deriva. El tramo que se
  reemplaza arranca en el primer movimiento que ha devuelto el banco, no en el `dateFrom` pedido, para no
  vaciar días que su horizonte de histórico no cubre; y si no devuelve nada, no se borra nada.
- **En el tramo que cubre el banco, el banco manda** (`deleteStatementOverlap()`): se borran los movimientos
  de extracto de ese rango. El extracto solo aporta lo anterior a ~90 días, que la API ya no devuelve.
- **La base de datos manda sobre localStorage.** `mergeTransactions()` se queda con el conjunto de la base de
  datos y arrastra `manualCategoryId` por id o, si el id ha cambiado, por contenido. Antes solo añadía por
  encima, así que nada desaparecía nunca del navegador y los duplicados sobrevivían a la limpieza del
  servidor. Solo los movimientos con prefijo `local-` (importados a mano en el navegador) viven fuera de la
  base de datos.
- Los dos ficheros de identidad están **duplicados a propósito** —`src/` no puede importar de `server/`— y
  tienen que dar el mismo id: cualquier cambio en la normalización va en los dos. El hash es SHA-1 truncado a
  12 hex, y `createHash` de Node y `crypto.subtle` del navegador coinciden.

`npm run db:migrate` migra datos antiguos a este esquema (`scripts/migrate-dedup.mjs`, con `--dry-run`). Es
idempotente. Tras ejecutarlo hay que abrir la app una vez para que `mergeTransactions()` rearrastre las
reclasificaciones manuales a los ids nuevos.

## Estado del usuario en Postgres — REGLA PERMANENTE

`src/lib/userState.ts`, `src/hooks/useUserState.ts`, tablas `app_state`, `trips` y `transaction_categories`.

**Nada que el usuario haya creado a mano puede vivir solo en el navegador.** Viajes, categorías,
reclasificaciones manuales, objetivo, umbral y system prompt están en Postgres. Los movimientos se pueden
volver a bajar del banco o reimportar del extracto; un viaje dado de alta a mano no sale de ninguna parte, así
que es justo el dato que no puede estar en el sitio más frágil.

- `GET /api/state` devuelve todo el estado de una vez; los campos sin configurar salen a `null` para
  distinguirlos de un valor puesto a vacío a propósito.
- `PUT /api/state` guarda el subconjunto que llegue en el cuerpo. Cada campo es un **reemplazo completo**,
  igual que los setters del cliente, que siempre entregan el valor entero.
- `useUserState` escribe con retardo (600 ms) para no lanzar una petición por tecla, y hace `flush()` en
  `beforeunload`. No guarda nada hasta que termina la carga inicial: si no, el estado por defecto pisaría en
  Postgres lo que el usuario ya tenía.
- **La migración de localStorage sube todos los campos, no solo los viajes.** Solo escribe donde el servidor
  tiene `null`. Si se dejara fuera el objetivo mensual, el estado local arrancaría con el valor por defecto y
  el primer guardado lo pisaría en la base de datos.
- `npm run db:trips <viajes.json>` restaura viajes desde un JSON. **Escribe el JSON en UTF-8**: un heredoc de
  bash en Windows lo escribe en la codepage de la consola y los acentos llegan como `U+FFFD`.
- **Los ids de categoría NO son estables entre versiones de la app.** `cat-5` significó *Compras* y hoy es
  *Suscripciones*; `cat-11` fue *Inversión* y hoy es *Efectivo*. Cualquier restauración de reclasificaciones
  antiguas tiene que mapear **por nombre**, nunca por id: copiar ids a ciegas manda los movimientos a
  categorías equivocadas, y con las categorías `excludeFromSpending` además falsea los totales.
  `npm run db:manual <fichero.json>` (`scripts/import-manual-categories.mjs`) lo hace bien: resuelve nombres
  contra las categorías actuales, empareja los movimientos por contenido —los ids viejos ya no existen— y no
  pisa las reclasificaciones que ya haya salvo con `--overwrite`.

## Estructura

- `src/lib/categorize.ts` — clasificador actual (reglas del prompt + palabras clave). Punto de sustitución
  para la llamada a la IA, manteniendo la firma.
- `src/lib/aggregate.ts` — agregados del panel: totales, fijo vs extraordinario, serie mensual y exclusiones.
- `src/lib/categories.ts` — categorías por defecto, presupuesto fijo mensual y flag `excludeFromSpending`.
- `src/lib/trips.ts` — viajes por fechas y su proyección como categorías virtuales.
- `src/lib/goal.ts` — objetivo mensual, progreso y proyección a cierre de mes.
- `server/` — API local (solo Node): cliente de Enable Banking, mapeo al `Transaction` de la app,
  persistencia en Neon y sesión del consentimiento. No importar nada de aquí desde `src/`.
- `server/auth.mjs` — usuario único desde el entorno, cookie de sesión firmada y bloqueo por intentos.
- `server/server.mjs` — servidor HTTP autónomo que monta la misma API, solo para Render. En local no se usa.
- `render.yaml` — Blueprint de Render para la API. Escrito, no desplegado.
- `vercel.json` — despliegue del front y **proxy de `/api` hacia Render**, que es lo que evita el CORS.
- `src/lib/auth.ts` / `src/components/AuthGate.tsx` / `LoginScreen.tsx` — cliente de acceso y puerta de
  entrada: `App` no se monta sin sesión.
- `src/lib/bankSync.ts` — cliente de esa API desde el navegador y fusión con lo que ya hay en localStorage.
- `server/dedupKey.mjs` / `src/lib/dedup.ts` — identidad de un movimiento por contenido. Espejos: mismo id
  en Node y en el navegador.
- `scripts/trust-cert.mjs` — instala la CA local de mkcert (`npm run cert:trust`).
- `scripts/import-statement.mjs` — importa un extracto `.xls` a Postgres. Es un **reemplazo**: borra los
  movimientos de `source='statement'` y los reinserta. No toca los del banco, que no se pueden regenerar
  desde un fichero. Al terminar descarta lo que solape con el tramo del banco.
- `scripts/create-schema.mjs` — crea el esquema en la base de datos que se le indique (`npm run db:schema`).
  No hace nada distinto de lo que la API hace sola; sirve para preparar un Postgres nuevo (el Neon
  desplegado) sin arrancar el dev server contra él.
- `scripts/migrate-dedup.mjs` — migración única a la deduplicación por contenido (`npm run db:migrate`).
- `scripts/seed-trips.mjs` — inserta o restaura viajes desde un JSON (`npm run db:trips`).
- `scripts/import-manual-categories.mjs` — restaura reclasificaciones manuales emparejando por contenido y
  resolviendo categorías por nombre (`npm run db:manual`).

## Comandos

```bash
npm run dev      # servidor de desarrollo, con la API local de banco/BDD montada dentro
npm run db:up    # arranca el Postgres local (docker start app_gastos_pg)
npm run db:down  # lo para
npm run db:schema  # crea/actualiza la estructura de la BDD (acepta una cadena de conexion como argumento)
npm run db:import  # importa un extracto .xls a la BDD (reemplaza los movimientos de extracto)
npm run db:migrate # migra la BDD a la deduplicacion por contenido (acepta --dry-run)
npm run db:trips <viajes.json>  # inserta/restaura viajes en la BDD
npm run db:manual <recl.json>   # restaura reclasificaciones manuales (acepta --apply, --overwrite)
npm run db:psql  # consola psql contra la BDD local
npm run cert:trust # instala la CA local de mkcert (quita el aviso de https://localhost:5173)
npx tsc -b       # typecheck
npx oxlint       # lint
```
