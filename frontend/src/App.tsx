import { useEffect } from "react";
import {
  createBrowserRouter,
  NavLink,
  Outlet,
  RouterProvider,
  useBlocker,
} from "react-router-dom";
import { StudioProvider, useStudio } from "./state";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { HomePage } from "./pages/HomePage";
import { StudioPage } from "./pages/StudioPage";
import { LevelsPage } from "./pages/LevelsPage";
import { HelpPage } from "./pages/HelpPage";
export function Layout() {
  const { draft } = useStudio();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      draft.dirty &&
      currentLocation.pathname === "/studio" &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!draft.dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.dirty]);
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <NavLink className="brand" to="/">
          <span className="brand-icon" aria-hidden="true">
            ✦
          </span>
          <span>
            DreamCraft<small>THE GAME STUDIO</small>
          </span>
        </NavLink>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ["/", "⌂", "Home"],
            ["/studio", "✎", "Studio"],
            ["/levels", "▧", "My Levels"],
            ["/help", "?", "Help"],
          ].map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span>✧</span>
          <b>
            Every game starts
            <br />
            with a little idea.
          </b>
          <p>Sketch it. Shape it. Play it.</p>
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" /> Manual & sample modes
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            DreamCraft <span className="muted">/ Your creative workspace</span>
          </span>
          <NavLink to="/help" className="top-help">
            Quick guide →
          </NavLink>
        </header>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>DreamCraft Studio</span>
          <span>Small sketches. New adventures.</span>
        </footer>
      </div>
      {blocker.state === "blocked" && (
        <ConfirmDialog
          message="You have unsaved changes. They stay in this session, but a refresh will lose them. Leave the studio?"
          onAnswer={(answer) => (answer ? blocker.proceed() : blocker.reset())}
        />
      )}
    </div>
  );
}
export const routes = [
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/studio", element: <StudioPage /> },
      { path: "/levels", element: <LevelsPage /> },
      { path: "/help", element: <HelpPage /> },
      {
        path: "*",
        element: (
          <section className="card">
            <h1>Page not found</h1>
            <NavLink to="/">Back to home</NavLink>
          </section>
        ),
      },
    ],
  },
];
export function App() {
  return (
    <StudioProvider>
      <RouterProvider router={router} />
    </StudioProvider>
  );
}
const router = createBrowserRouter(routes);
