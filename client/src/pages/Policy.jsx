import { Fragment } from "react";
import { Link, useParams } from "react-router-dom";
import { useTitle } from "../hooks/useAsync.js";
import { parsePolicy, inlineParts } from "../lib/policyText.js";
import NotFound from "./NotFound.jsx";
import privacy from "../content/policies/privacy.txt?raw";
import refund from "../content/policies/refund.txt?raw";
import shipping from "../content/policies/shipping.txt?raw";
import terms from "../content/policies/terms.txt?raw";

// The policy wording lives in src/content/policies/*.txt. To change a policy, edit its .txt file and redeploy: nothing else needs touching.
const POLICIES = { terms, privacy, refund, shipping };

function Inline({ text }) {
  return inlineParts(text).map((p, i) => {
    if (p.href) return <a key={i} href={p.href} className="link-u" {...(p.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{p.text}</a>;
    if (p.to) return <Link key={i} to={p.to} className="link-u">{p.text}</Link>;
    return p.bold ? <strong key={i}>{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>;
  });
}

export default function Policy() {
  const { slug } = useParams();
  const raw = Object.hasOwn(POLICIES, slug) ? POLICIES[slug] : null;
  const blocks = raw ? parsePolicy(raw) : [];
  const title = blocks.find((b) => b.type === "title")?.text;
  useTitle(title);
  if (!raw) return <NotFound />;
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      {blocks.map((b, i) => {
        if (b.type === "title") return <h1 key={i} className="font-display text-5xl md:text-6xl">{b.text}</h1>;
        if (b.type === "h2") return <h2 key={i} className="mt-10 font-display text-2xl">{b.text}</h2>;
        if (b.type === "h3") return <h3 key={i} className="mt-6 text-lg font-medium">{b.text}</h3>;
        if (b.type === "ul") return <ul key={i} className="mt-3 list-disc space-y-1 pl-6">{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>;
        return <p key={i} className="mt-3 leading-relaxed">{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}<Inline text={l} /></Fragment>)}</p>;
      })}
      <p className="mt-12 text-sm"><Link to="/contact" className="link-u">Questions? Contact us.</Link></p>
    </div>
  );
}
