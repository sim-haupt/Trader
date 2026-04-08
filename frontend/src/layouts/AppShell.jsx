import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import brandMark from "../assets/tradingstats-mark.svg";

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
        <header className="top-status">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:gap-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[var(--line)] bg-white/[0.03]">
                  <img src={brandMark} alt="tradingStats" className="h-9 w-9" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tracking-[-0.025em] text-white">tradingStats</p>
                  <p className="text-xs text-white/42">Execution intelligence</p>
                </div>
              </div>

              <nav className="flex flex-wrap items-center gap-2">
                {navigationItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-4 py-2.5 text-sm ${
                        isActive
                          ? "rounded-[12px] border border-[rgba(124,156,255,0.24)] bg-[rgba(124,156,255,0.12)] text-white shadow-[inset_0_0_0_1px_rgba(124,156,255,0.14)]"
                          : "ui-button text-white/78"
                      }`
                    }
                  >
                    <span className={location.pathname.startsWith(item.path) ? "text-[var(--accent-strong)]" : "text-white/46"}>
                      <NavIcon path={item.icon} />
                    </span>
                    {item.label}
                  </NavLink>
                ))}

                {user?.role === "ADMIN" && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-4 py-2.5 text-sm ${
                        isActive
                          ? "rounded-[12px] border border-[rgba(124,156,255,0.24)] bg-[rgba(124,156,255,0.12)] text-white shadow-[inset_0_0_0_1px_rgba(124,156,255,0.14)]"
                          : "ui-button text-white/78"
                      }`
                    }
                  >
                    <span className={location.pathname.startsWith("/admin") ? "text-[var(--accent-strong)]" : "text-white/46"}>
                      <NavIcon path="M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5v4m0 4h.01" />
                    </span>
                    Admin
                  </NavLink>
                )}

                <button
                  type="button"
                  onClick={() => navigate("/trades?mode=import")}
                  className="ui-button-solid px-4 py-2.5 text-sm"
                >
                  Import Trades
                </button>
              </nav>
            </div>

            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <div className="rounded-[14px] border border-[var(--line)] bg-white/[0.025] px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                <p className="text-sm font-semibold text-white">{user?.name}</p>
                <p className="mt-0.5 text-xs text-white/38">{user?.email}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="ui-button px-4 py-2.5 text-sm text-white/78"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="min-h-0 px-0 py-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
