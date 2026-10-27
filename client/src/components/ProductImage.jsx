import { useState } from "react";
import OptimizedImage from "./OptimizedImage.jsx";

// Shows the real asset if it exists; otherwise a clearly labelled placeholder tee.
export default function ProductImage({ src, hex = "#cdbd9a", alt = "", label = "Placeholder", className = "", eager = false, widths, sizes }) {
  // Remember WHICH src failed, so reusing this component for a different image (carousels) starts fresh.
  const [failedSrc, setFailedSrc] = useState(null);
  const failed = failedSrc === src;
  if (src && !failed) {
    return (
      <OptimizedImage src={src} alt={alt} eager={eager} widths={widths} sizes={sizes} onError={() => setFailedSrc(src)}
        className={`h-full w-full object-cover ${className}`} />
    );
  }
  return (
    <div role="img" aria-label={alt ? `${alt} (placeholder image)` : "Placeholder image"}
      className={`relative flex h-full w-full items-center justify-center bg-base-200 ${className}`}>
      <svg viewBox="0 0 100 120" className="h-[70%] w-[70%]" aria-hidden="true">
        <path d="M30 10 L10 25 L18 45 L28 40 L28 108 L72 108 L72 40 L82 45 L90 25 L70 10 Q50 24 30 10Z"
          fill={hex} stroke="#151515" strokeOpacity=".25" strokeWidth="1" />
      </svg>
      <span className="eyebrow absolute bottom-2 left-2 text-[0.6rem] opacity-50">{label} · replaceable</span>
    </div>
  );
}
