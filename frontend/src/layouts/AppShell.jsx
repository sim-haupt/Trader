import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClasses =
  "rounded-full px-4 py-2 text-sm font-medium transition hover:bg-white/10";

function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-transparent">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-mint">Trader Journal</p>
            <h1 className="text-xl font-semibold text-white">Execution with context</h1>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `${linkClasses} ${isActive ? "bg-mint text-ink" : "text-slate-200"}`
              }
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/trades"
              className={({ isActive }) =>
                `${linkClasses} ${isActive ? "bg-mint text-ink" : "text-slate-200"}`
              }
            >
              Trades
            </NavLink>
            {user?.role === "ADMIN" && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `${linkClasses} ${isActive ? "bg-mint text-ink" : "text-slate-200"}`
                }
              >
                Admin
              </NavLink>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-mist">{user?.role}</p>
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
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;
