import { useEffect } from 'react'
import { updatePageMeta } from '../utils/updatePageMeta'

export const useContentfulSEO = (pageSlug, fallbackSEO) => {
  useEffect(() => {
    // Use fallback SEO data immediately
    updatePageMeta(fallbackSEO)
  }, [fallbackSEO])

  return { seoData: fallbackSEO, loading: false }
}