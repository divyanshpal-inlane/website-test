import React from 'react';

// Asset-aware Image component that automatically prepends base URL for GitHub Pages
interface AssetImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  assetSrc: string;
  fallbackSrc?: string;
}

export const AssetImage: React.FC<AssetImageProps> = ({ 
  assetSrc, 
  fallbackSrc,
  ...props 
}) => {
  const base = import.meta.env.BASE_URL || '/';
  const src = assetSrc.startsWith('/') ? assetSrc.slice(1) : assetSrc;
  const fullSrc = `${import.meta.env.BASE_URL || '/'}${src}`;

  return <img src={fullSrc} {...props} />;
};

export default AssetImage;