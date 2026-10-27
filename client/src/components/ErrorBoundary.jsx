import { Component } from "react";

// Catches render crashes so a bug shows a message instead of a blank page.
// The original error is still logged to the console.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Render error:", error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 640, margin: "6rem auto", padding: "0 1.5rem", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: ".5rem" }}>Something went wrong</h1>
        <p>This page failed to render. Try reloading; if it keeps happening, check the browser console.</p>
        {import.meta.env.DEV && <pre style={{ marginTop: "1rem", whiteSpace: "pre-wrap", fontSize: ".8rem" }}>{String(this.state.error?.stack || this.state.error)}</pre>}
        <button onClick={() => location.reload()} style={{ marginTop: "1rem", padding: ".6rem 1rem", border: "1px solid #151515" }}>Reload</button>
      </div>
    );
  }
}
