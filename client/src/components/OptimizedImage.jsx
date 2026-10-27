import { AdvancedImage } from "@cloudinary/react";
import { cloudinarySources } from "../lib/cloudinary.js";

export const CARD_WIDTHS = [320, 480, 640, 960];
export const CARD_SIZES = "(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw";

// The one image component for the storefront. Cloudinary-hosted images are delivered through the official
// Cloudinary React SDK (<AdvancedImage>) with f_auto + q_auto, resized to a few responsive widths and lazy-loaded.
// Legacy local images (/assets/..., /api/uploads/...) and other hosts render as a normal <img>, unchanged.
export default function OptimizedImage({ src, alt = "", widths = CARD_WIDTHS, sizes = CARD_SIZES, eager = false, priority = false, className = "", onError, ...rest }) {
  const cld = cloudinarySources(src, widths);
  const common = { alt, decoding: "async", loading: eager ? "eager" : "lazy", className, onError, ...(priority ? { fetchPriority: "high" } : {}), ...rest };
  if (!cld) return <img src={src} {...common} />;
  return <AdvancedImage cldImg={cld.image} srcSet={cld.srcSet} sizes={sizes} {...common} />;
}
