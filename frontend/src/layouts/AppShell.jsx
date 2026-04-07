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
      <aside className="border-b-2 border-mint/30 bg-[linear-gradient(180deg,rgba(4,8,6,0.98),rgba(1,3,2,0.98))] px-5 py-6 lg:min-h-screen lg:border-b-0 lg:border-r-2 lg:px-6">
        <div className="ui-panel flex items-center justify-between px-4 py-5">
          <div>
            <p className="ui-title text-xs text-mist">System</p>
            <h1 className="ui-title mt-3 text-3xl text-[#effff6]">Trader</h1>
          </div>
          <div className="ui-chip">
            Mk-II
          </div>
        </div>

        <nav className="mt-6 space-y-2">
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-4 border-2 px-4 py-3 text-base font-medium uppercase tracking-[0.08em] transition ${
                  isActive
                    ? "border-mint bg-mint/12 text-[#effff6]"
                    : "border-transparent text-mist hover:border-mint/20 hover:bg-mint/6 hover:text-[#effff6]"
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
                `flex items-center gap-4 border-2 px-4 py-3 text-base font-medium uppercase tracking-[0.08em] transition ${
                  isActive
                    ? "border-mint bg-mint/12 text-[#effff6]"
                    : "border-transparent text-mist hover:border-mint/20 hover:bg-mint/6 hover:text-[#effff6]"
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
          className="ui-button-solid mt-8 flex w-full items-center justify-center text-base"
        >
          Import Trades
        </button>

        <div className="ui-panel mt-8 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="ui-title text-sm text-[#effff6]">{user?.name}</p>
              <p className="mt-2 text-sm uppercase tracking-[0.18em] text-mist">Role: {user?.role}</p>
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
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b-2 border-mint/30 bg-[rgba(2,5,4,0.94)]">
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 xl:flex-row xl:items-center xl:justify-between xl:px-8">
            <div>
              <p className="ui-title text-xs text-mist">Command Deck</p>
              <h2 className="ui-title mt-3 text-3xl text-[#effff6]">{sectionTitle}</h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="ui-button px-4 py-2.5 text-sm"
              >
                Edit Layout
              </button>
              <div className="ui-panel flex items-center p-1">
                {["30 Days", "60 Days", "90 Days"].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    className={`px-4 py-2 text-sm font-medium uppercase tracking-[0.08em] transition ${
                      index === 0
                        ? "bg-mint text-black"
                        : "text-mist hover:bg-mint/10 hover:text-[#effff6]"
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
