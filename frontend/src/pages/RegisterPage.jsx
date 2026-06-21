import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function RegisterPage() {
  const navigate = useNavigate();
  const { register, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
      await register(form);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-black px-4 py-10">
      <div className="mx-auto w-full max-w-xl rounded-[6px] border border-[var(--line)] bg-[#050505] p-8 sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--line)] bg-black">
                <img src="/favicon.png" alt="tradingStats" className="h-7 w-7" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">tradingStats</p>
                <p className="text-xs text-white/44">Structured review workspace</p>
              </div>
            </div>
            <p className="ui-title text-xs text-white/42">Start journaling</p>
            <h1 className="mt-4 text-4xl font-medium tracking-[-0.05em] text-white">Create your account</h1>
          </div>
          <div className="ui-chip bg-white/[0.03] text-white/64">Beta</div>
        </div>
        <p className="mt-3 max-w-lg text-base leading-7 text-white/54">
          Set up your workspace and start building a repeatable review process around every trade.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Full name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            required
            className="ui-input"
          />
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
            className="ui-button-solid w-full text-sm"
          >
            {isSubmitting ? "Creating account..." : "Register"}
          </button>
        </form>

          <p className="mt-6 text-base text-white/54">
          Already have an account?{" "}
          <Link to="/login" className="ui-link font-medium underline decoration-white/10 underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
