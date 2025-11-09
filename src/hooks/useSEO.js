import { useEffect } from 'react'
import { updatePageMeta } from '../utils/updatePageMeta'

export const useSEO = (seoData) => {
  useEffect(() => {
    if (seoData) {
      updatePageMeta(
        seoData.title,
        seoData.description,
        seoData.keywords,
        seoData.ogImage,
        seoData.canonical
      )
    }
  }, [seoData])
}