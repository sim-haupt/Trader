import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(form);
      navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-black/30 bg-[linear-gradient(180deg,rgba(14,16,22,0.96),rgba(8,10,14,0.98))] shadow-glow lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden border-r border-black/30 bg-[radial-gradient(circle_at_top_left,rgba(99,167,255,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(25,195,125,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-10 lg:block">
          <p className="ui-title text-xs text-white/45">Trading Journal</p>
          <h1 className="mt-6 max-w-md text-5xl font-bold leading-[1.05] tracking-[-0.05em] text-white">
            Review the tape. Preserve the edge.
          </h1>
          <p className="mt-6 max-w-lg text-xl leading-8 text-white/68">
            Track execution quality, import broker history, and spot patterns with fast
            analytics built for active traders.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="ui-panel px-4 py-4">
              <p className="ui-title text-xs text-white/45">Edge Tracking</p>
              <p className="mt-3 text-2xl font-semibold text-mint">Execution Replay</p>
            </div>
            <div className="ui-panel px-4 py-4">
              <p className="ui-title text-xs text-white/45">Console Mode</p>
              <p className="mt-3 text-2xl font-semibold text-white">Review Ready</p>
            </div>
          </div>
        </section>

        <section className="p-8 sm:p-10">
          <p className="ui-title text-xs text-white/45">Access</p>
          <h2 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-white">Welcome back</h2>
          <p className="mt-3 text-lg text-white/64">Sign in to continue managing your journal.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
              className="ui-input"
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              required
              className="ui-input"
            />

            {error && <p className="ui-notice border-coral/30 bg-[#2a1111] text-coral">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="ui-button-solid w-full text-sm"
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="mt-6 text-lg text-white/64">
            New here?{" "}
            <Link to="/register" className="font-semibold text-white underline decoration-white/20 underline-offset-4">
              Create an account
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
