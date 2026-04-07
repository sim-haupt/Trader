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
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/50 shadow-glow backdrop-blur lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden bg-[radial-gradient(circle_at_top_left,_rgba(114,243,198,0.32),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.02),_rgba(255,255,255,0))] p-10 lg:block">
          <p className="text-xs uppercase tracking-[0.35em] text-mint">Trader Journal</p>
          <h1 className="mt-6 max-w-md text-5xl font-semibold leading-tight text-white">
            Review your edge, not just your entries.
          </h1>
          <p className="mt-6 max-w-lg text-base text-mist">
            Track execution quality, import broker history, and spot patterns with fast
            analytics built for active traders.
          </p>
        </section>

        <section className="p-8 sm:p-10">
          <h2 className="text-3xl font-semibold text-white">Welcome back</h2>
          <p className="mt-2 text-sm text-mist">Sign in to continue managing your journal.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-mint"
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              required
              className="w-full rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white outline-none transition focus:border-mint"
            />

            {error && <p className="rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#8df6d2] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="mt-6 text-sm text-mist">
            New here?{" "}
            <Link to="/register" className="font-semibold text-mint">
              Create an account
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
