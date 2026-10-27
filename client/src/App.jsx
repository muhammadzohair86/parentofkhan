import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Shop from "./pages/Shop.jsx";
import Product from "./pages/Product.jsx";
import Cart from "./pages/Cart.jsx";
import Checkout from "./pages/Checkout.jsx";
import OrderStatus from "./pages/OrderStatus.jsx";
import TrackOrder from "./pages/TrackOrder.jsx";
import AccountOrder from "./pages/AccountOrder.jsx";
import Contact from "./pages/Contact.jsx";
import Policy from "./pages/Policy.jsx";
import NotFound from "./pages/NotFound.jsx";

// The admin dashboard is a separate chunk: storefront visitors never download it.
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));

export default function App() {
  return (
    <Routes>
      <Route path="admin/*" element={<Suspense fallback={<p className="p-10 text-sm opacity-60">Loading…</p>}><AdminApp /></Suspense>} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="shop/:category" element={<Shop />} />
        <Route path="product/:slug" element={<Product />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="order/:orderNumber/:token" element={<OrderStatus />} />
        <Route path="track-order" element={<TrackOrder />} />
        <Route path="account/orders/:orderNumber" element={<AccountOrder />} />
        <Route path="contact" element={<Contact />} />
        <Route path="policies/:slug" element={<Policy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
