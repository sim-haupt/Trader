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
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012)),var(--surface-2)] shadow-[0_32px_90px_rgba(0,0,0,0.35)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden border-r border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(103,168,255,0.16),transparent_28%),radial-gradient(circle_at_85%_80%,rgba(56,217,150,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)] p-12 lg:block">
          <p className="ui-title text-xs text-white/42">Execution Review Platform</p>
          <h1 className="mt-8 max-w-lg text-5xl font-bold leading-[0.98] tracking-[-0.055em] text-white">
            Trade analytics with the clarity of a premium terminal.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/64">
            Review executions, track behavior, compare setups, and turn every session into a system you can improve.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="ui-metric-tile">
              <p className="ui-title text-[10px] text-white/42">Trade Review</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">Execution Replay</p>
              <p className="mt-2 text-sm leading-6 text-white/54">Click into trades and inspect fills, notes, tags, and context in one place.</p>
            </div>
            <div className="ui-metric-tile">
              <p className="ui-title text-[10px] text-white/42">Performance</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-mint">Decision Grade</p>
              <p className="mt-2 text-sm leading-6 text-white/54">Surface what works with cumulative P&L, streaks, win-rate, reports, and drawdown analysis.</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-center p-8 sm:p-12">
          <p className="ui-title text-xs text-white/42">Access</p>
          <h2 className="mt-4 text-[2.75rem] font-bold tracking-[-0.05em] text-white">Welcome back</h2>
          <p className="mt-3 max-w-md text-base leading-7 text-white/62">
            Sign in to continue reviewing your journal, imports, and performance reports.
          </p>

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

          <p className="mt-6 text-base text-white/62">
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
