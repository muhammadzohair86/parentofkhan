import { useMemo, useState } from "react";
import { useAsync } from "../hooks/useAsync.js";
import { getHero } from "../services/catalog.js";
import { cloudinarySources } from "../lib/cloudinary.js";

// Built-in fallbacks (public/assets/hero). Used when the database has no hero configured,
// when the hero request fails, or when a configured image fails to load.
const LOCAL_DESKTOP = "/assets/hero/hero.jpg";
const LOCAL_MOBILE = "/assets/hero/hero-mobile.jpg";
const DEFAULT_ALT = "Parent Of Khan seasonal campaign";

// Ordered list of image sets to try; each load error advances to the next one.
function candidates(cfg) {
  const list = [];
  if (cfg?.desktopImage || cfg?.mobileImage) {
    const desktop = cfg.desktopImage || LOCAL_DESKTOP;
    if (cfg.mobileImage) list.push({ desktop, mobile: cfg.mobileImage });
    list.push({ desktop, mobile: null });
  }
  list.push({ desktop: LOCAL_DESKTOP, mobile: LOCAL_MOBILE }, { desktop: LOCAL_DESKTOP, mobile: null });
  return list;
}

// Editorial hero. Images come from the database (/api/site/hero) with local fallbacks.
// No buttons by design — it flows straight into the featured grid.
export default function Hero() {
  const { data: cfg, loading } = useAsync(() => getHero().catch(() => null), []); // a failed request just means "use fallbacks"
  const list = useMemo(() => candidates(cfg), [cfg]);
  const [step, setStep] = useState(0);
  const cur = list[step];
  const alt = cfg?.alt || DEFAULT_ALT;
  // Cloudinary-hosted hero images get f_auto/q_auto and a few responsive widths; local fallbacks are used as they are.
  const d = cur && cloudinarySources(cur.desktop, [1024, 1600, 2400]);
  const m = cur?.mobile && cloudinarySources(cur.mobile, [480, 768, 1080]);
  return (
    <section aria-label="Parent Of Khan" className="relative h-[78svh] min-h-[480px] w-full overflow-hidden bg-neutral">
      {loading ? null : cur ? (
        <picture key={`${step}|${cur.desktop}|${cur.mobile}`}>
          {cur.mobile && <source media="(max-width: 767px)" srcSet={m ? m.srcSet : cur.mobile} sizes="100vw" />}
          <img src={d ? d.src : cur.desktop} srcSet={d?.srcSet} sizes="100vw" alt={alt} fetchPriority="high" onError={() => setStep((s) => s + 1)}
            className="absolute inset-0 h-full w-full object-cover object-center" />
        </picture>
      ) : (
        <div className="absolute inset-0 flex items-start justify-end p-4">
          <span className="eyebrow text-neutral-content/50">Hero placeholder · set a hero image in the admin or add public/assets/hero/hero.jpg</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" aria-hidden="true" />
      <div className="relative mx-auto flex h-full max-w-[1600px] items-end px-5 pb-10 lg:px-10 lg:pb-16">
        <h1 className="font-display text-[clamp(3rem,9vw,8.5rem)] leading-[0.92] tracking-tight text-neutral-content">
          Inherited humour.<br /><span className="italic">Printed on cotton.</span>
        </h1>
      </div>
    </section>
  );
}
