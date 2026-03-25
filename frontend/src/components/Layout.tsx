import { NavLink, Outlet } from "react-router-dom";
import { useAppData } from "../contexts/AppDataContext";

export function Layout() {
  const { busyAction, message } = useAppData();

  return (
    <div className="app-shell container-fluid px-0">
      <aside className="sidebar">
        <div className="brand d-flex align-items-center">
          <div className="brand-mark">JH</div>
          <div>
            <h1 className="mb-0">Job IA Hunter</h1>
            <p>Remote-first job matching cockpit</p>
          </div>
        </div>

        <nav className="nav nav-pills flex-column">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/jobs">Jobs</NavLink>
          <NavLink to="/admin">Admin</NavLink>
          <NavLink to="/logs">Logs</NavLink>
        </nav>

        <div className="sidebar-note card border-0">
          <span className="sidebar-label">Live status</span>
          <strong>{busyAction ?? "Idle"}</strong>
          <p>{message ?? "System ready"}</p>
        </div>
      </aside>

      <main className="main-content container-fluid">
        <Outlet />
      </main>
    </div>
  );
}
