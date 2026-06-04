import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-5xl font-bold text-ink-300">404</p>
      <p className="text-ink-500">This page doesn’t exist.</p>
      <Link to="/" className="btn-primary">
        Back to Console Home
      </Link>
    </div>
  );
}
