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
    <div className="min-h-screen bg-black px-4 py-10">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[6px] border border-[var(--line)] bg-[#050505] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden border-r border-[var(--line)] px-10 py-12 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--line)] bg-black">
                <img src="/favicon.png" alt="tradingStats" className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">tradingStats</p>
                <p className="text-xs text-white/44">Structured review workspace</p>
              </div>
            </div>

            <p className="ui-title mt-12 text-xs text-white/42">Workspace</p>
            <h1 className="mt-6 max-w-xl text-[3.4rem] font-medium leading-[0.94] tracking-[-0.055em] text-white">
              Review your trading with less noise and more signal.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/54">
              A clean workspace for execution review, reporting, journaling, and session-by-session analysis.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="ui-metric-tile bg-white/[0.03]">
              <p className="ui-title text-[10px] text-white/42">Trade Review</p>
              <p className="mt-3 text-xl font-medium tracking-[-0.03em] text-white">Execution Replay</p>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Inspect fills, context, notes, and chart behavior in one place.
              </p>
            </div>
            <div className="ui-metric-tile bg-white/[0.03]">
              <p className="ui-title text-[10px] text-white/42">Reports</p>
              <p className="mt-3 text-xl font-medium tracking-[-0.03em] text-white">Structured Analytics</p>
              <p className="mt-2 text-sm leading-6 text-white/50">
                Track behavior, drawdown, price buckets, and daily performance trends.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-center px-8 py-10 sm:px-12 sm:py-12">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--line)] bg-black">
                <img src="/favicon.png" alt="tradingStats" className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">tradingStats</p>
                <p className="text-xs text-white/44">Structured review workspace</p>
              </div>
            </div>
          </div>

          <p className="ui-title text-xs text-white/42">Access</p>
          <h2 className="mt-4 text-[2.6rem] font-medium tracking-[-0.05em] text-white">Welcome back</h2>
          <p className="mt-3 max-w-md text-base leading-7 text-white/54">
            Sign in to continue reviewing trades, journal sessions, and performance reports.
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
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

            {error && <p className="ui-notice border-coral/20 bg-coral/10 text-coral">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="ui-button-solid mt-2 w-full text-sm"
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>

          <p className="mt-6 text-base text-white/54">
            New here?{" "}
            <Link to="/register" className="ui-link font-medium underline decoration-white/10 underline-offset-4">
              Create an account
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
