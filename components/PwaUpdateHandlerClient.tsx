'use client'

/**
 * Thin 'use client' boundary that lazily loads PwaUpdateHandler with ssr:false.
 *
 * WHY THIS EXISTS — Next.js 15 HMR race (see CLAUDE.md):
 * app/layout.tsx is a Server Component. When it directly imports a 'use client'
 * module, Next.js embeds that module's ID in the RSC stream via I[moduleId, chunks].
 * A second HMR compilation fires ~2s after initial load; during that window the
 * module factory is disposed from __webpack_modules__ while React's requireModule
 * is still running → "Cannot read properties of undefined (reading 'call')".
 *
 * Wrapping with next/dynamic({ ssr: false }) removes the module from the RSC
 * I[...] reference map entirely — it loads lazily client-side after hydration,
 * completely sidestepping the race.
 */
import dynamic from 'next/dynamic'

const PwaUpdateHandler = dynamic(() => import('./pwa-update-handler'), {
  ssr: false,
})

export default PwaUpdateHandler
