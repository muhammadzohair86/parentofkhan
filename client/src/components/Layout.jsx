import { Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import SearchDrawer from "./SearchDrawer.jsx";
import AccountDrawer from "./AccountDrawer.jsx";
import CartDrawer from "./CartDrawer.jsx";
import { useAuth } from "../store/useAuth.js";
import { useCartSync } from "../hooks/useCartSync.js";

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { useAuth.getState().init(); }, []);
  useCartSync();
  return (
    <>
      <div id="app-shell">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:bg-base-100 focus:p-3">Skip to content</a>
        <Header />
        <main id="main"><Outlet /></main>
        <Footer />
      </div>
      <SearchDrawer /><AccountDrawer /><CartDrawer />
    </>
  );
}
