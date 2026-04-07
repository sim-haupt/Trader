import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navigationItems = [
  { label: "Dashboard", path: "/dashboard", icon: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { label: "Calendar", path: "/calendar", icon: "M7 2v3M17 2v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" },
  { label: "Reports", path: "/reports", icon: "M4 19V9M10 19V5M16 19v-8M22 19V3" },
  { label: "Trades", path: "/trades", icon: "M4 18h16M5 15l4-4 3 3 7-8" },
  { label: "Journal", path: "/journal", icon: "M7 4h10a2 2 0 0 1 2 2v12H7a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2zm0 0a2 2 0 0 0-2 2v14" }
];

function NavIcon({ path }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const sectionTitle =
    navigationItems.find((item) => location.pathname.startsWith(item.path))?.label ||
    (location.pathname.startsWith("/admin") ? "Admin" : "Dashboard");

  return (
    <div className="min-h-screen bg-transparent lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(24,33,53,0.96),rgba(18,25,42,0.96))] px-5 py-6 backdrop-blur lg:min-h-screen lg:border-b-0 lg:border-r lg:px-6">
        <div className="flex items-center justify-between rounded-[28px] border border-white/8 bg-white/[0.03] px-4 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-mint">Trader Journal</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">TraderVue</h1>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-mist">
            Pro
          </div>
        </div>

        <nav className="mt-6 space-y-2">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-2xl px-4 py-3 text-base font-medium transition ${
                  isActive
                    ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <span className="text-mint">
                <NavIcon path={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}

          {user?.role === "ADMIN" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-2xl px-4 py-3 text-base font-medium transition ${
                  isActive
                    ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <span className="text-gold">
                <NavIcon path="M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5v4m0 4h.01" />
              </span>
              Admin
            </NavLink>
          )}
        </nav>

        <button
          type="button"
          onClick={() => navigate("/trades")}
          className="mt-8 flex w-full items-center justify-center rounded-2xl bg-mint px-5 py-4 text-base font-semibold text-ink transition hover:bg-[#8df6d2]"
        >
          Import Trades
        </button>

        <div className="mt-8 rounded-[28px] border border-white/8 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{user?.name}</p>
              <p className="mt-1 text-sm text-mist">Role: {user?.role}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-coral hover:text-coral"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/70 backdrop-blur">
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 xl:flex-row xl:items-center xl:justify-between xl:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-mint">Workspace</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">{sectionTitle}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Edit Layout
              </button>
              <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1">
                {["30 Days", "60 Days", "90 Days"].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      index === 0 ? "bg-white/10 text-white" : "text-mist hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-8 sm:px-6 xl:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
