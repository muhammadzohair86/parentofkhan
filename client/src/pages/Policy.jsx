import { Link, useParams } from "react-router-dom";
import { useTitle } from "../hooks/useAsync.js";
import NotFound from "./NotFound.jsx";

// Starter structures only. Every section needs the owner’s real business details and legal review.
const POLICIES = {
  terms: { title: "Terms & Conditions", sections: ["Using this website", "Orders and pricing", "Intellectual property and designs", "Limitation of liability", "Governing law", "Changes to these terms"] },
  privacy: { title: "Privacy Policy", sections: ["Information we collect", "How we use information", "Payment processing", "Cookies and sessions", "Your rights and choices", "Contact for privacy questions"] },
  refund: { title: "Refund Policy", sections: ["Eligibility for returns", "Return window", "Damaged or incorrect items", "How refunds are issued", "Return shipping costs"] },
  shipping: { title: "Shipping Policy", sections: ["Where we ship", "Processing time", "Shipping rates", "Delivery estimates", "Tracking", "Customs, duties and taxes"] },
};

export default function Policy() {
  const { slug } = useParams();
  const policy = POLICIES[slug];
  useTitle(policy?.title);
  if (!policy) return <NotFound />;
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="font-display text-5xl md:text-6xl">{policy.title}</h1>
      <p role="note" className="mt-6 border border-warning p-4 text-sm">
        <strong>Draft structure — needs owner confirmation.</strong> The sections below are placeholders. Business-specific details and legal wording must be added and checked before launch; this page does not claim legal compliance.
      </p>
      <div className="mt-10 space-y-8">
        {policy.sections.map((s) => (
          <section key={s}><h2 className="font-display text-2xl">{s}</h2><p className="mt-2 opacity-70">[To be confirmed by the business owner.]</p></section>
        ))}
      </div>
      <p className="mt-12 text-sm"><Link to="/contact" className="link-u">Questions? Contact us.</Link></p>
    </div>
  );
}
