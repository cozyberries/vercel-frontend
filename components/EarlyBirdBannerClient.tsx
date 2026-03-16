'use client'

/**
 * Thin 'use client' boundary that lazily loads EarlyBirdBanner with ssr:false.
 * Lives in its own file so HomeClientSections.tsx stays unmodified on this
 * branch — keeping it out of the HMR update and avoiding the webpack
 * module-factory race that occurs when a modified module is disposed before
 * React's concurrent renderer finishes hydration.
 */
import dynamic from 'next/dynamic'

const EarlyBirdBanner = dynamic(() => import('./early-bird-banner'), {
  ssr: false,
})

export default EarlyBirdBanner
