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
    <div className="min-h-screen bg-grid bg-[length:24px_24px] lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="border-b-4 border-black bg-[linear-gradient(180deg,rgba(35,23,51,0.98),rgba(16,11,29,0.98))] px-5 py-6 lg:min-h-screen lg:border-b-0 lg:border-r-4 lg:px-6">
        <div className="flex items-center justify-between rounded-[10px] border-2 border-black bg-[linear-gradient(180deg,rgba(70,47,122,0.96),rgba(43,29,75,0.96))] px-4 py-5 shadow-[0_0_0_2px_rgba(82,58,140,0.88),0_0_0_6px_rgba(0,0,0,0.65)]">
          <div>
            <p className="text-xs uppercase tracking-[0.38em] text-cyan">Arcade Ledger</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[0.2em] text-[#fff8e8]">TRADER</h1>
          </div>
          <div className="rounded-[6px] border-2 border-black bg-amber px-3 py-2 text-xs uppercase tracking-[0.25em] text-black">
            Mk-II
          </div>
        </div>

        <nav className="mt-6 space-y-2">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-[8px] border-2 px-4 py-3 text-base font-medium uppercase tracking-[0.08em] transition ${
                  isActive
                    ? "border-black bg-[linear-gradient(180deg,rgba(89,185,255,0.98),rgba(79,150,227,0.98))] text-black shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
                    : "border-transparent text-[#c6bde3] hover:border-black hover:bg-[linear-gradient(180deg,rgba(75,52,128,0.94),rgba(55,38,96,0.94))] hover:text-[#fff8e8]"
                }`
              }
            >
              <span className={location.pathname.startsWith(item.path) ? "text-black" : "text-cyan"}>
                <NavIcon path={item.icon} />
              </span>
              {item.label}
            </NavLink>
          ))}

          {user?.role === "ADMIN" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-[8px] border-2 px-4 py-3 text-base font-medium uppercase tracking-[0.08em] transition ${
                  isActive
                    ? "border-black bg-[linear-gradient(180deg,rgba(255,181,63,0.98),rgba(214,136,44,0.98))] text-black shadow-[0_0_0_2px_rgba(0,0,0,0.35)]"
                    : "border-transparent text-[#c6bde3] hover:border-black hover:bg-[linear-gradient(180deg,rgba(75,52,128,0.94),rgba(55,38,96,0.94))] hover:text-[#fff8e8]"
                }`
              }
            >
              <span className="text-amber">
                <NavIcon path="M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5v4m0 4h.01" />
              </span>
              Admin
            </NavLink>
          )}
        </nav>

        <button
          type="button"
          onClick={() => navigate("/trades")}
          className="mt-8 flex w-full items-center justify-center rounded-[8px] border-2 border-black bg-[linear-gradient(180deg,rgba(255,181,63,0.98),rgba(214,136,44,0.98))] px-5 py-4 text-base font-semibold uppercase tracking-[0.12em] text-black shadow-[0_0_0_2px_rgba(0,0,0,0.35)] transition hover:translate-y-[1px]"
        >
          Import Trades
        </button>

        <div className="mt-8 rounded-[10px] border-2 border-black bg-[linear-gradient(180deg,rgba(70,47,122,0.96),rgba(43,29,75,0.96))] p-4 shadow-[0_0_0_2px_rgba(82,58,140,0.88),0_0_0_6px_rgba(0,0,0,0.65)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[#fff8e8]">{user?.name}</p>
              <p className="mt-1 text-sm uppercase tracking-[0.18em] text-[#c6bde3]">Role: {user?.role}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-[8px] border-2 border-black bg-[linear-gradient(180deg,rgba(89,185,255,0.98),rgba(79,150,227,0.98))] px-4 py-2 text-sm font-medium uppercase tracking-[0.08em] text-black transition hover:translate-y-[1px]"
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b-4 border-black bg-[linear-gradient(180deg,rgba(50,34,82,0.96),rgba(33,22,56,0.96))]">
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 xl:flex-row xl:items-center xl:justify-between xl:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.38em] text-cyan">Command Deck</p>
              <h2 className="mt-2 text-3xl font-semibold uppercase tracking-[0.14em] text-[#fff8e8]">{sectionTitle}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-[8px] border-2 border-black bg-[linear-gradient(180deg,rgba(89,185,255,0.98),rgba(79,150,227,0.98))] px-4 py-2.5 text-sm font-medium uppercase tracking-[0.08em] text-black transition hover:translate-y-[1px]"
              >
                Edit Layout
              </button>
              <div className="flex items-center rounded-[8px] border-2 border-black bg-[linear-gradient(180deg,rgba(40,27,69,0.98),rgba(29,20,51,0.98))] p-1 shadow-[0_0_0_2px_rgba(0,0,0,0.45)]">
                {["30 Days", "60 Days", "90 Days"].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={`rounded-[6px] px-4 py-2 text-sm font-medium uppercase tracking-[0.08em] transition ${
                      index === 0
                        ? "bg-[linear-gradient(180deg,rgba(255,181,63,0.98),rgba(214,136,44,0.98))] text-black"
                        : "text-[#c6bde3] hover:bg-[linear-gradient(180deg,rgba(75,52,128,0.94),rgba(55,38,96,0.94))] hover:text-[#fff8e8]"
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
