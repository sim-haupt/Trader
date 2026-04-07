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
      <div className="grid w-full max-w-5xl overflow-hidden border-2 border-[#2a2240] bg-[linear-gradient(180deg,rgba(16,12,24,0.96),rgba(7,5,11,0.98))] shadow-crt lg:grid-cols-[1.15fr_0.85fr]">
        <section className="hidden border-r-2 border-[#2a2240] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.04),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-10 lg:block">
          <p className="ui-title text-xs text-mist">Trading Journal</p>
          <h1 className="ui-title mt-6 max-w-md text-4xl leading-tight text-white">
            Review the tape. Preserve the edge.
          </h1>
          <p className="mt-6 max-w-lg text-xl text-mist">
            Track execution quality, import broker history, and spot patterns with fast
            analytics built for active traders.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="ui-panel px-4 py-4">
              <p className="ui-title text-xs text-mist">Edge Tracking</p>
              <p className="mt-3 text-2xl font-semibold text-mint">Execution Replay</p>
            </div>
            <div className="ui-panel px-4 py-4">
              <p className="ui-title text-xs text-mist">Console Mode</p>
              <p className="mt-3 text-2xl font-semibold text-white">Review Ready</p>
            </div>
          </div>
        </section>

        <section className="p-8 sm:p-10">
          <p className="ui-title text-xs text-mist">Access Node</p>
          <h2 className="ui-title mt-4 text-3xl text-white">Welcome Back</h2>
          <p className="mt-3 text-lg text-mist">Sign in to continue managing your journal.</p>

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

          <p className="mt-6 text-lg text-mist">
            New here?{" "}
            <Link to="/register" className="ui-title text-white">
              Create an account
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
