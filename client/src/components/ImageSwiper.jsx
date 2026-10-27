import { useEffect, useRef, useState } from "react";
import ProductImage from "./ProductImage.jsx";

// Touch-friendly looping image carousel (no library). Horizontal drags move the images with your finger;
// vertical drags are left to the browser (touch-action: pan-y) so the page still scrolls normally.
// Three slides (previous, current, next) are rendered, which makes looping seamless for any image count.
export default function ImageSwiper({ images, hex, alt = "", eager = false }) {
  const n = images.length;
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const box = useRef(null);
  const st = useRef({ id: null, x: 0, y: 0, drag: false, width: 1, dx: 0 });
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (n <= 1) return <ProductImage src={images[0]} hex={hex} alt={alt} eager={eager} />;

  const wrap = (i) => (i + n) % n;
  const settle = (to, dir) => {
    setAnim(true);
    setDx(to);
    timer.current = setTimeout(() => { setAnim(false); if (dir) setIndex((i) => wrap(i + dir)); setDx(0); }, 260);
  };

  const down = (e) => {
    if (anim) return;
    st.current = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false, width: box.current?.offsetWidth || 1, dx: 0 };
  };
  const move = (e) => {
    const s = st.current;
    if (s.id !== e.pointerId) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (!s.drag) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) { s.drag = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      else return;
    }
    s.dx = mx;
    setDx(mx);
  };
  const up = (e) => {
    const s = st.current;
    if (s.id !== e.pointerId) return;
    s.id = null;
    if (!s.drag) return;
    const threshold = Math.max(30, s.width * 0.18);
    const dir = s.dx < -threshold ? 1 : s.dx > threshold ? -1 : 0; // 1 = next, -1 = previous
    settle(dir ? -dir * s.width : 0, dir);
  };
  const cancel = () => { // the browser took over (vertical scroll): spring back
    const s = st.current;
    if (s.id === null) return;
    s.id = null;
    if (s.drag) settle(0, 0);
  };
  // A swipe must never count as a tap on the product link underneath.
  const swallowClick = (e) => { if (st.current.drag) { e.preventDefault(); e.stopPropagation(); st.current.drag = false; } };

  return (
    <div ref={box} className="relative h-full w-full touch-pan-y select-none overflow-hidden"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onClickCapture={swallowClick}>
      <div className="absolute inset-0" style={{ transform: `translateX(${dx}px)`, transition: anim ? "transform 250ms cubic-bezier(.22,.61,.36,1)" : "none" }}>
        {[-1, 0, 1].map((o) => (
          <div key={o} className="absolute inset-0" style={{ left: `${o * 100}%` }}>
            <ProductImage src={images[wrap(index + o)]} hex={hex} alt={alt} eager={eager && o === 0} className="pointer-events-none" />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
        {images.map((_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full shadow-[0_0_2px_rgba(0,0,0,.5)] transition-colors ${i === index ? "bg-white" : "bg-white/50"}`} />
        ))}
      </div>
    </div>
  );
}
