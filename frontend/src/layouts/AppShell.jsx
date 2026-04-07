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

  return (
    <div className="min-h-screen bg-grid bg-[length:24px_24px]">
      <header className="sticky top-0 z-20 border-b-2 border-[#221b31] bg-[rgba(15,12,22,0.92)] backdrop-blur">
        <div className="px-4 py-4 sm:px-6 xl:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <nav className="flex flex-wrap items-center gap-3">
              {navigationItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 text-[11px] uppercase transition ${
                      isActive ? "ui-button-solid" : "ui-button text-[#f4f6fb]"
                    }`
                  }
                >
                  <span className={location.pathname.startsWith(item.path) ? "text-[#07110f]" : "text-[#f4f6fb]"}>
                    <NavIcon path={item.icon} />
                  </span>
                  {item.label}
                </NavLink>
              ))}

              {user?.role === "ADMIN" && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 text-[11px] uppercase transition ${
                      isActive ? "ui-button-solid" : "ui-button text-[#f4f6fb]"
                    }`
                  }
                >
                  <span className={location.pathname.startsWith("/admin") ? "text-[#07110f]" : "text-[#f4f6fb]"}>
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
                className="ui-button-solid px-4 py-3 text-[11px]"
              >
                Import Trades
              </button>
              <div className="text-right">
                <p className="ui-title text-[10px] text-[#f4f6fb]">{user?.name}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="ui-button px-4 py-3 text-[11px]"
              >
                Logout
              </button>
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
