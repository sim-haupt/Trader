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

function getPageMeta(pathname) {
  if (pathname.startsWith("/calendar")) {
    return { title: "Calendar", description: "Daily performance and journal entry points." };
  }
  if (pathname.startsWith("/reports")) {
    return { title: "Reports", description: "Compare behavior, performance, and instrument context." };
  }
  if (pathname.startsWith("/trades/")) {
    return { title: "Trade Review", description: "Execution detail, notes, and chart context." };
  }
  if (pathname.startsWith("/trades")) {
    return { title: "Trades", description: "Import, filter, and review your full trade history." };
  }
  if (pathname.startsWith("/journal")) {
    return { title: "Journal", description: "Daily summaries, reflections, and trading notes." };
  }
  if (pathname.startsWith("/settings")) {
    return { title: "Settings", description: "Reusable tags, strategies, and account defaults." };
  }
  if (pathname.startsWith("/admin")) {
    return { title: "Admin", description: "Workspace oversight and user trade management." };
  }
  return { title: "Dashboard", description: "Performance overview across your trading workspace." };
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const pageMeta = getPageMeta(location.pathname);

  return (
    <div className="app-shell">
      <div className="desktop-frame">
        <aside className="ui-sidebar hidden min-h-screen px-4 py-4 xl:block">
          <div className="flex items-center gap-3 px-2 pb-5 pt-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--line)] bg-black">
              <img src={brandMark} alt="tradingStats" className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-[-0.02em] text-white">tradingStats</p>
              <p className="text-xs text-[var(--text-muted)]">trader</p>
            </div>
          </div>

          <nav className="ui-sidebar-nav">
            {navigationItems.map((item) => (
              <NavLink key={item.path} to={item.path}>
                {({ isActive }) => (
                  <span className="ui-sidebar-link" data-active={isActive || location.pathname.startsWith(item.path)}>
                    <span className={(isActive || location.pathname.startsWith(item.path)) ? "text-mint" : "text-white/42"}>
                      <NavIcon path={item.icon} />
                    </span>
                    <span>{item.label}</span>
                  </span>
                )}
              </NavLink>
            ))}

            {user?.role === "ADMIN" ? (
              <NavLink to="/admin">
                {({ isActive }) => (
                  <span className="ui-sidebar-link" data-active={isActive || location.pathname.startsWith("/admin")}>
                    <span className={(isActive || location.pathname.startsWith("/admin")) ? "text-mint" : "text-white/42"}>
                      <NavIcon path="M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5v4m0 4h.01" />
                    </span>
                    <span>Admin</span>
                  </span>
                )}
              </NavLink>
            ) : null}
          </nav>

          <div className="mt-8 space-y-3 px-2">
            <button
              type="button"
              onClick={() => navigate("/trades?mode=import")}
              className="ui-button-solid w-full justify-center px-4 py-2.5 text-sm"
            >
              Import Trades
            </button>
            <div className="rounded-[6px] border border-[var(--line)] bg-black px-4 py-3">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="ui-button w-full justify-center px-4 py-2.5 text-sm text-white/76"
            >
              Logout
            </button>
          </div>
        </aside>

        <div className="ui-content">
          <header className="top-status">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[1.05rem] font-semibold tracking-[-0.03em] text-white">{pageMeta.title}</p>
                <p className="mt-1 text-sm text-white/36">{pageMeta.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:hidden">
                {navigationItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                  className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 text-sm ${
                        isActive
                          ? "rounded-[6px] border border-[var(--line)] bg-[#1f1f1f] text-white"
                          : "ui-button text-white/74"
                      }`
                    }
                  >
                    <span className={location.pathname.startsWith(item.path) ? "text-white" : "text-white/42"}>
                      <NavIcon path={item.icon} />
                    </span>
                    {item.label}
                  </NavLink>
                ))}
                {user?.role === "ADMIN" ? (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `flex items-center gap-2 px-3 py-2 text-sm ${
                        isActive
                          ? "rounded-[6px] border border-[var(--line)] bg-[#1f1f1f] text-white"
                          : "ui-button text-white/74"
                      }`
                    }
                  >
                    <span className={location.pathname.startsWith("/admin") ? "text-white" : "text-white/42"}>
                      <NavIcon path="M12 3l7 4v10l-7 4-7-4V7l7-4zm0 5v4m0 4h.01" />
                    </span>
                    Admin
                  </NavLink>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => navigate("/trades?mode=import")}
                  className="ui-button-solid px-4 py-2.5 text-sm xl:hidden"
                >
                  Import Trades
                </button>
              <div className="rounded-[6px] border border-[var(--line)] bg-black px-4 py-2.5 text-right">
                <p className="text-sm font-medium text-white">{user?.name}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="ui-button px-4 py-2.5 text-sm text-white/74 xl:hidden"
              >
                Logout
              </button>
              </div>
            </div>
          </header>

          <main className="ui-content-body min-h-0">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default AppShell;
