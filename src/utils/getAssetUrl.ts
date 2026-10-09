// Global asset URL helper - works with GitHub Pages base path
export function getAssetUrl(path: string): string {
  if (typeof window !== 'undefined' && window.__BASE_URL__) {
    const base = window.__BASE_URL__;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${base}${cleanPath}`;
  }
  // Fallback for SSR or when window is not available
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${cleanPath}`;
}

export function assetUrl(path: string): string {
  if (!path) return '';
  if (typeof window !== 'undefined' && window.__BASE_URL__) {
    const base = window.__BASE_URL__;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${base}${cleanPath}`;
  }
  const base = import.meta.env.BASE_URL || '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${cleanPath}`;
}

export function assetUrlOrEmpty(path: string | undefined | null): string {
  if (!path) return '';
  return getAssetUrl(path);
}

// Convenience hook for React components
export function useAssetUrl() {
  return getAssetUrl;
}

export default { getAssetUrl, assetUrl, assetUrlOrEmpty };