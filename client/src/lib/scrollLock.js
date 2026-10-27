// Page scroll lock shared by the menu, sheets and dialogs. Reference-counted so overlapping overlays cooperate.
//
// IMPORTANT: lock ONLY <body> (exactly like Drawer.jsx does). While <html> keeps overflow: visible, the browser
// applies body's overflow to the viewport, so the page stays where it is and position: sticky keeps working.
// Setting overflow on <html> as well makes <body> its own overflow container, which detaches the sticky navbar
// from the viewport (it scrolls away) whenever the page is scrolled.
let locks = 0;
let saved = null;

export function lockScroll(doc = document) {
  if (locks++ === 0) {
    saved = doc.body.style.overflow;
    doc.body.style.overflow = "hidden";
  }
}

export function unlockScroll(doc = document) {
  if (locks > 0 && --locks === 0) {
    doc.body.style.overflow = saved ?? "";
    saved = null;
  }
}
