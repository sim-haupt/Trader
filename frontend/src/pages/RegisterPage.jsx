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
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-[28px] border border-black/30 bg-[linear-gradient(180deg,rgba(14,16,22,0.96),rgba(8,10,14,0.98))] p-8 shadow-glow sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="ui-title text-xs text-white/45">Start Journaling</p>
            <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-white">Create your account</h1>
          </div>
          <div className="ui-chip">New</div>
        </div>
        <p className="mt-3 text-lg text-white/64">
          Build a repeatable review process around every trade you take.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
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

          {error && <p className="ui-notice border-coral/30 bg-[#2a1111] text-coral">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="ui-button-solid w-full text-sm"
          >
            {isSubmitting ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="mt-6 text-lg text-white/64">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-white underline decoration-white/20 underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
