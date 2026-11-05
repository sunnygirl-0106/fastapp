import { watchFile, unwatchFile } from 'node:fs'

/** Watch external prompt sources, including editors that replace the entire file. */
export function promptDocReload(promptDoc) {
  let listener
  const stop = () => { if (listener) { unwatchFile(promptDoc, listener); listener = undefined } }
  return {
    name: 'prompt-doc-reload',
    apply: 'serve',
    configureServer(server) {
      listener = (curr, prev) => {
        if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) return
        server.moduleGraph.invalidateAll()
        server.ws.send({ type: 'full-reload' })
        server.config.logger.info('提示词文档已更新，已重新读取并刷新页面', { timestamp: true })
      }
      watchFile(promptDoc, { interval: 1000 }, listener)
      server.httpServer?.once('close', stop)
    },
    // Also clean up middleware-mode servers, which have no httpServer.
    closeBundle: stop,
  }
}
