// Storefront data layer backed by the Express API. Failed requests throw ApiError;
// they are never replaced with fake data.
import { apiGet, apiPost, ApiError } from "./api.js";
import { MIN_SEARCH } from "../lib.js";

export async function getCategories({ navbar, homepage } = {}) {
  const { data } = await apiGet("/categories", {
    navbar: navbar ? "true" : undefined,
    homepage: homepage ? "true" : undefined,
  });
  return data;
}

export async function getProducts({ featured, category, sort, color, q } = {}) {
  const path = featured ? "/products/featured" : "/products";
  const { data } = await apiGet(path, { category, sort, color, q, limit: 100 });
  return data;
}

// Resolves to null when the product does not exist (or is inactive); throws for other failures.
export async function getProduct(slug) {
  try {
    const { data } = await apiGet(`/products/${encodeURIComponent(slug)}`);
    return data;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null; // 400 = malformed slug
    throw e;
  }
}

// One page of products plus pagination metadata: { data, meta: { page, limit, total, totalPages } }.
export async function getProductsPage({ category, sort, color, q, page, limit } = {}) {
  const { data, meta } = await apiGet("/products", { category, sort, color, q, page, limit });
  return { data, meta };
}

// Colors used by visible products (optionally within a category / search): [{ name, hex }].
export async function getFacets({ category, q } = {}) {
  const { data } = await apiGet("/products/facets", { category, q });
  return data;
}

// Live search for the sidebar. `signal` lets the caller cancel a request that has been superseded.
export async function searchProducts(q, signal) {
  const term = q.trim();
  if (term.length < MIN_SEARCH) return [];
  const { data } = await apiGet("/products", { q: term, limit: 8 }, signal);
  return data;
}

export async function getSettings() {
  // Contact details and socials have no API yet; nothing is configured, so nothing is shown.
  return { contact: {}, socials: [] };
}

// Homepage hero: { desktopImage, mobileImage, alt } where images are null when not configured in the database.
export async function getHero() {
  const { data } = await apiGet("/site/hero");
  return data;
}

export async function getFeatures() {
  const { data } = await apiGet("/site/features");
  return data;
}

export async function getPaymentMethods() {
  const { data } = await apiGet("/site/payment-methods");
  return data;
}

// Resolves to "subscribed" | "already_subscribed"; throws ApiError (e.g. 400 invalid email, 429 rate limited).
export async function subscribeNewsletter(email) {
  const { data } = await apiPost("/newsletter", { email });
  return data.status;
}
