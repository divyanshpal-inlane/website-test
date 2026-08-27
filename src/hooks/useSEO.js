import { useEffect } from 'react'
import { updatePageMeta } from '../utils/updatePageMeta'

export const useSEO = (seoData) => {
  useEffect(() => {
    if (seoData) {
      updatePageMeta(seoData)
    }
  }, [seoData])
}