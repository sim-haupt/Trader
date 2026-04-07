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
    <div className="min-h-screen bg-grid bg-[length:24px_24px]">
      <header className="sticky top-0 z-20 border-b border-[#d7dbe3] bg-[rgba(251,252,254,0.92)] backdrop-blur">
        <div className="px-4 py-2 sm:px-6 xl:px-8">
          <div className="ui-panel overflow-hidden px-0 py-0">
            <div className="border-b border-[#d7dbe3] bg-[linear-gradient(90deg,rgba(140,108,255,0.16),rgba(107,125,255,0.08),rgba(255,184,77,0.08))] px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-mist">
                <div className="ui-chip">Workspace</div>
                <div className="hidden sm:block ui-title text-[10px] text-mist">Trading Journal System</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="ui-title text-[10px] text-cyan">Active Section</p>
                  <h2 className="ui-title mt-1 text-base text-phosphor">{sectionTitle}</h2>
                </div>
              </div>

              <nav className="flex flex-wrap items-center gap-2">
                {navigationItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 border-2 px-4 py-2.5 text-sm font-medium uppercase tracking-[0.08em] transition ${
                        isActive
                          ? "border-cyan bg-[linear-gradient(180deg,rgba(125,144,255,0.18),rgba(255,255,255,0.92))] text-phosphor"
                          : "border-transparent text-mist hover:border-cyan/25 hover:bg-white/70 hover:text-phosphor"
                      }`
                    }
                  >
                    <span className={location.pathname.startsWith(item.path) ? "text-cyan" : "text-mist"}>
                      <NavIcon path={item.icon} />
                    </span>
                    {item.label}
                  </NavLink>
                ))}

                {user?.role === "ADMIN" && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `flex items-center gap-3 border-2 px-4 py-2.5 text-sm font-medium uppercase tracking-[0.08em] transition ${
                        isActive
                          ? "border-cyan bg-[linear-gradient(180deg,rgba(125,144,255,0.18),rgba(255,255,255,0.92))] text-phosphor"
                          : "border-transparent text-mist hover:border-cyan/25 hover:bg-white/70 hover:text-phosphor"
                      }`
                    }
                  >
                    <span className={location.pathname.startsWith("/admin") ? "text-cyan" : "text-mist"}>
                      <NavIcon path="M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5v4m0 4h.01" />
                    </span>
                    Admin
                  </NavLink>
                )}
              </nav>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/trades?mode=import")}
                  className="ui-button-solid px-4 py-2 text-sm"
                >
                  Import Trades
                </button>
                <div className="text-right">
                  <p className="ui-title text-xs text-phosphor">{user?.name}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-mist">{user?.role}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="ui-button px-4 py-2 text-sm"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-8 sm:px-6 xl:px-8">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;
