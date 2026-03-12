import { NavLink, Outlet } from "react-router-dom";
import { useAppData } from "../contexts/AppDataContext";

export function Layout() {
  const { busyAction, message } = useAppData();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">JH</div>
          <div>
            <h1>Job IA Hunter</h1>
            <p>Remote-first job matching cockpit</p>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/jobs">Jobs</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>

        <div className="sidebar-note">
          <span className="sidebar-label">Live status</span>
          <strong>{busyAction ?? "Idle"}</strong>
          <p>{message ?? "System ready"}</p>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
