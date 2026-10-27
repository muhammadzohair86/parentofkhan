import { Link } from "react-router-dom";
import { useTitle } from "../hooks/useAsync.js";

export default function NotFound() {
  useTitle("Page not found");
  return (
    <div className="mx-auto max-w-3xl px-5 py-28 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-display mt-2 text-6xl">Page not found</h1>
      <p className="mt-4 opacity-70">That page doesn’t exist or has moved.</p>
      <Link to="/" className="btn-khan mt-8">Back home</Link>
    </div>
  );
}
