import { Link } from "react-router-dom";
import Hero from "../components/Hero.jsx";
import ProductGrid, { GridSkeleton } from "../components/ProductGrid.jsx";
import { useAsync, useTitle } from "../hooks/useAsync.js";
import { getCategories, getProducts } from "../services/catalog.js";

const Wrap = ({ children }) => <div className="mx-auto max-w-[1600px] px-5 lg:px-10">{children}</div>;

function CategorySection({ category }) {
  const { data, loading, error } = useAsync(() => getProducts({ category: category.slug }), [category.slug]);
  if (!loading && !error && !data?.length) return null;
  return (
    <section aria-labelledby={`cat-${category.slug}`} className="mt-24">
      <Wrap>
        <div className="mb-8 flex items-end justify-between gap-4 border-b border-base-300 pb-4">
          <div>
            <h2 id={`cat-${category.slug}`} className="font-display text-4xl md:text-5xl">{category.name}</h2>
            {category.description && <p className="mt-1 text-sm opacity-70">{category.description}</p>}
          </div>
          <Link to={`/shop/${category.slug}`} className="link-u shrink-0 text-sm">View all</Link>
        </div>
        {loading ? <GridSkeleton /> : error ? <p role="alert" className="opacity-70">Could not load {category.name}.</p> : <ProductGrid products={data.slice(0, 4)} />}
      </Wrap>
    </section>
  );
}

export default function Home() {
  useTitle("");
  const featured = useAsync(() => getProducts({ featured: true }), []);
  const cats = useAsync(() => getCategories({ homepage: true }), []);
  return (
    <>
      <Hero />
      <section aria-labelledby="featured-h" className="pt-14">
        <Wrap>
          <h2 id="featured-h" className="font-display mb-8 text-4xl md:text-5xl">Featured</h2>
          {featured.loading && <GridSkeleton />}
          {featured.error && <p role="alert">Could not load products. Please refresh.</p>}
          {featured.data && (featured.data.length ? <ProductGrid products={featured.data} eagerCount={4} /> : <p className="opacity-70">No featured products yet.</p>)}
        </Wrap>
      </section>
      {cats.error && <Wrap><p role="alert" className="mt-16 opacity-70">Could not load categories. Please refresh.</p></Wrap>}
      {cats.data?.map((c) => <CategorySection key={c.id} category={c} />)}
    </>
  );
}
