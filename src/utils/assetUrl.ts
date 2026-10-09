// Base URL utility for GitHub Pages
// Use import.meta.env.BASE_URL which is automatically set by Vite

export const baseUrl = import.meta.env.BASE_URL || '/';

export function assetUrl(path: string): string {
  if (!path) return '';
  const base = import.meta.env.BASE_URL || '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${cleanPath}`;
}

export function assetUrlOrEmpty(path: string | undefined | null): string {
  if (!path) return '';
  return assetUrl(path);
}

// Asset-aware Image component
export interface AssetImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  assetSrc: string;
}

export const AssetImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement> & { assetSrc: string }> = ({ 
  assetSrc, 
  ...props 
}) => {
  const base = import.meta.env.BASE_URL || '/';
  const src = assetSrc.startsWith('/') ? assetSrc.slice(1) : assetSrc;
  const fullSrc = `${import.meta.env.BASE_URL || '/'}${src}`;
  return <img src={fullSrc} {...props} />;
};

export default { assetUrl, assetUrlOrEmpty, baseUrl, AssetImage };