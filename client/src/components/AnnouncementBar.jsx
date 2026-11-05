import { useEffect, useState } from "react";
import { getAnnouncement } from "../services/catalog.js";

// Slim promo bar above the navbar. The text and colors are managed in Admin > Announcement and read from the API: no redeploy needed.
// Rendered as plain text (never HTML). Colors are applied only if they are plain #rrggbb values (the server validates them too).
// Nothing is shown while loading, if the bar is switched off, or if it could not be loaded (it is decoration: the shop works without it).
const HEX = /^#[0-9a-f]{6}$/i;
let lastGood = null; // survives route changes and remounts for this page session
const REFRESH_MS = 60_000;

export default function AnnouncementBar() {
  const [a, setA] = useState(lastGood);
  useEffect(() => {
    let live = true, last = 0;
    const load = () => {
      if (Date.now() - last < REFRESH_MS) return;
      last = Date.now();
      getAnnouncement().then(
        (d) => { lastGood = d; if (live) setA(d); },
        () => { last = 0; }, // failed: keep whatever we showed before and try again on the next focus
      );
    };
    load();
    window.addEventListener("focus", load); // picks up an admin's change when the visitor returns to the tab
    return () => { live = false; window.removeEventListener("focus", load); };
  }, []);

  if (!a || !a.enabled || !a.text || !HEX.test(a.backgroundColor) || !HEX.test(a.textColor)) return null;
  return (
    <div role="region" aria-label="Announcement" style={{ backgroundColor: a.backgroundColor, color: a.textColor }}
      className="px-4 py-2 text-center text-[0.65rem] font-medium uppercase leading-snug tracking-[0.18em] sm:text-xs">
      {a.text}
    </div>
  );
}
