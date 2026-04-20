/**
 * DuckDB-WASM singleton initialisation.
 *
 * Uses local bundles (resolved by Vite via new URL + import.meta.url)
 * so that Workers are served from the same origin — required because
 * browsers block Workers loaded from cross-origin CDN URLs.
 */
import * as duckdb from '@duckdb/duckdb-wasm'

let _db: duckdb.AsyncDuckDB | null = null
let _bundle: { mainModule: string; mainWorker: string; pthreadWorker?: string } | null = null

async function getBundle() {
  if (_bundle) return _bundle
  const LOCAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
      mainModule: new URL(
        '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
        import.meta.url,
      ).href,
      mainWorker: new URL(
        '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
        import.meta.url,
      ).href,
    },
    eh: {
      mainModule: new URL(
        '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
        import.meta.url,
      ).href,
      mainWorker: new URL(
        '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
        import.meta.url,
      ).href,
    },
  }
  const b = await duckdb.selectBundle(LOCAL_BUNDLES)
  _bundle = { mainModule: b.mainModule!, mainWorker: b.mainWorker!, pthreadWorker: b.pthreadWorker }
  return _bundle
}

async function freshDB(): Promise<duckdb.AsyncDuckDB> {
  // Terminate previous instance so its file registry is fully cleared
  if (_db) {
    await _db.terminate().catch(() => {})
    _db = null
  }
  const b = await getBundle()
  const worker = new Worker(b.mainWorker)
  const logger = new duckdb.ConsoleLogger()
  const db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(b.mainModule, b.pthreadWorker)
  _db = db
  return db
}

/**
 * Opens a .duckdb file in an in-memory DuckDB instance.
 * Returns a connection ready for queries.
 */
export async function openFile(
  file: File,
): Promise<{ db: duckdb.AsyncDuckDB; conn: duckdb.AsyncDuckDBConnection }> {
  // Always start a fresh DuckDB instance — guarantees the file registry is
  // empty and avoids "File is already registered and is still buffered".
  const db = await freshDB()

  // Use BROWSER_FILEREADER so DuckDB reads pages on-demand instead of
  // copying the entire file (~750 MB) into the Wasm heap up front.
  await db.registerFileHandle(
    'session.duckdb',
    file,
    duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
    false,
  )

  const conn = await db.connect()
  await conn.query("ATTACH 'session.duckdb' AS sess (READ_ONLY)")
  await conn.query('USE sess')

  return { db, conn }
}

/**
 * Close a connection opened by openFile.
 */
export async function closeConnection(conn: duckdb.AsyncDuckDBConnection) {
  try {
    await conn.query('DETACH sess')
  } catch {
    // ignore if already detached
  }
  await conn.close()
}
