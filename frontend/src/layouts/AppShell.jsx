import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navigationItems = [
  { label: "Dashboard", path: "/dashboard", icon: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { label: "Calendar", path: "/calendar", icon: "M7 2v3M17 2v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" },
  { label: "Reports", path: "/reports", icon: "M4 19V9M10 19V5M16 19v-8M22 19V3" },
  { label: "Trades", path: "/trades", icon: "M4 18h16M5 15l4-4 3 3 7-8" },
  { label: "Journal", path: "/journal", icon: "M7 4h10a2 2 0 0 1 2 2v12H7a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2zm0 0a2 2 0 0 0-2 2v14" },
  { label: "Settings", path: "/settings", icon: "M12 3l2.4 2.2 3.2-.6.9 3.1 3 1.2-1.3 3 1.3 3-3 1.2-.9 3.1-3.2-.6L12 21l-2.4-2.2-3.2.6-.9-3.1-3-1.2 1.3-3-1.3-3 3-1.2.9-3.1 3.2.6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" }
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

  return (
    <div className="app-shell">
      <div className="desktop-frame">
        <header className="top-status sticky top-0 z-20">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-6">
              <div className="hidden items-center gap-3 xl:flex">
                <div className="h-10 w-10 rounded-2xl bg-[linear-gradient(135deg,rgba(255,255,255,0.28),rgba(255,255,255,0.08))] p-[1px]">
                  <div className="flex h-full w-full items-center justify-center rounded-2xl bg-[#121723] text-lg font-bold text-white">
                    T
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-[0.02em] text-white">Trader</p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/38">Journal</p>
                </div>
              </div>

              <nav className="flex flex-wrap items-center gap-2">
                {navigationItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2.5 text-sm transition ${
                      isActive
                        ? "ui-button-solid shadow-[0_10px_20px_rgba(255,255,255,0.08)]"
                        : "ui-button bg-white/[0.03] text-white/92"
                    }`
                  }
                >
                    <span className={location.pathname.startsWith(item.path) ? "text-black" : "text-white/80"}>
                      <NavIcon path={item.icon} />
                    </span>
                    {item.label}
                  </NavLink>
                ))}

                {user?.role === "ADMIN" && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2.5 text-sm transition ${
                      isActive
                        ? "ui-button-solid shadow-[0_10px_20px_rgba(255,255,255,0.08)]"
                        : "ui-button bg-white/[0.03] text-white/92"
                    }`
                  }
                  >
                    <span className={location.pathname.startsWith("/admin") ? "text-black" : "text-white/80"}>
                      <NavIcon path="M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5v4m0 4h.01" />
                    </span>
                    Admin
                  </NavLink>
                )}

                <button
                  type="button"
                  onClick={() => navigate("/trades?mode=import")}
                  className="ui-button-solid px-4 py-2.5 text-sm !bg-[#f4c85c] !text-black shadow-[0_10px_20px_rgba(244,200,92,0.16)]"
                >
                  Import Trades
                </button>
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-[12px] border border-[#e5e7eb42] bg-white/[0.03] px-4 py-2.5 text-right">
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-white/45">{user?.role}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="ui-button px-4 py-2.5 text-sm text-white/92"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="min-h-0 px-1 py-1 sm:px-1 xl:px-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
