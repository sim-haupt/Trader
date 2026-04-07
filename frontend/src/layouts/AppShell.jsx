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
    <div className="min-h-screen bg-grid bg-[length:26px_26px] lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="border-b border-mint/12 bg-[linear-gradient(180deg,rgba(7,12,10,0.98),rgba(4,7,6,0.98))] px-5 py-6 backdrop-blur lg:min-h-screen lg:border-b-0 lg:border-r lg:px-6">
        <div className="flex items-center justify-between rounded-[22px] border border-mint/15 bg-[linear-gradient(180deg,rgba(11,18,15,0.9),rgba(5,9,7,0.92))] px-4 py-5 shadow-crt">
          <div>
            <p className="text-xs uppercase tracking-[0.38em] text-mint">Arcade Ledger</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[0.2em] text-phosphor">TRADER</h1>
          </div>
          <div className="rounded-xl border border-mint/15 bg-mint/8 px-3 py-2 text-xs uppercase tracking-[0.25em] text-mint">
            Mk-II
          </div>
        </div>

        <nav className="mt-6 space-y-2">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-[18px] border px-4 py-3 text-base font-medium uppercase tracking-[0.08em] transition ${
                  isActive
                    ? "border-mint/30 bg-mint/10 text-phosphor shadow-crt"
                    : "border-transparent text-mist hover:border-mint/10 hover:bg-mint/5 hover:text-phosphor"
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
                `flex items-center gap-4 rounded-[18px] border px-4 py-3 text-base font-medium uppercase tracking-[0.08em] transition ${
                  isActive
                    ? "border-mint/30 bg-mint/10 text-phosphor shadow-crt"
                    : "border-transparent text-mist hover:border-mint/10 hover:bg-mint/5 hover:text-phosphor"
                }`
              }
            >
              <span className="text-mint">
                <NavIcon path="M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5v4m0 4h.01" />
              </span>
              Admin
            </NavLink>
          )}
        </nav>

        <button
          type="button"
          onClick={() => navigate("/trades")}
          className="mt-8 flex w-full items-center justify-center rounded-[18px] border border-mint/35 bg-mint/12 px-5 py-4 text-base font-semibold uppercase tracking-[0.12em] text-phosphor transition hover:bg-mint/18"
        >
          Import Trades
        </button>

        <div className="mt-8 rounded-[22px] border border-mint/15 bg-[linear-gradient(180deg,rgba(11,18,15,0.9),rgba(5,9,7,0.92))] p-4 shadow-crt">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.1em] text-phosphor">{user?.name}</p>
              <p className="mt-1 text-sm uppercase tracking-[0.18em] text-mist">Role: {user?.role}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-mint/20 px-4 py-2 text-sm font-medium uppercase tracking-[0.08em] text-phosphor transition hover:border-mint hover:text-mint"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-mint/12 bg-[rgba(3,6,5,0.82)] backdrop-blur">
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 xl:flex-row xl:items-center xl:justify-between xl:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.38em] text-mint">Command Deck</p>
              <h2 className="mt-2 text-3xl font-semibold uppercase tracking-[0.12em] text-phosphor">{sectionTitle}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-[18px] border border-mint/15 bg-mint/6 px-4 py-2.5 text-sm font-medium uppercase tracking-[0.08em] text-mist transition hover:bg-mint/12 hover:text-phosphor"
              >
                Edit Layout
              </button>
              <div className="flex items-center rounded-[18px] border border-mint/15 bg-[rgba(8,14,11,0.92)] p-1 shadow-crt">
                {["30 Days", "60 Days", "90 Days"].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={`rounded-[14px] px-4 py-2 text-sm font-medium uppercase tracking-[0.08em] transition ${
                      index === 0 ? "bg-mint/12 text-phosphor" : "text-mist hover:text-phosphor"
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
