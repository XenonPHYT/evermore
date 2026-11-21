import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from "react-router";
import { api, useApi } from "./api";
import { Brand, Heading, Wait } from "./ui";
import "./style.css";
const Studio = lazy(() => import("./studio"));
const Account = lazy(() => import("./account"));
const Settings = lazy(() => import("./settings"));
const Pages = lazy(() => import("./pages"));
const Public = lazy(() => import("./public"));
const nav = [
  ["/app", "⌂", "Home"],
  ["/app/templates", "✧", "Templates"],
  ["/app/creations", "◇", "Creations"],
  ["/app/inbox", "✉", "Notes"],
  ["/app/notifications", "◉", "Alerts"],
  ["/app/settings", "⚙", "Settings"],
];
function Shell() {
  const { data, error, reload } = useApi<{ account: { id: string } | null }>(
    "/auth/me",
  );
  const navigate = useNavigate();
  if (!data) return <Wait error={error} retry={reload} />;
  if (!data.account) return <Navigate to="/account/login" replace />;
  return (
    <div className="shell">
      <aside>
        <Brand />
        <nav aria-label="Workspace">
          {nav.map(([href, icon, text]) => (
            <NavLink key={href} to={href} end={href === "/app"}>
              <span aria-hidden="true">{icon}</span>
              {text}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-end">
          <Link to="/help">Help & support</Link>
          <button
            className="quiet"
            onClick={() =>
              api("/auth/logout", "POST")
                .then(() => navigate("/"))
                .catch(reload)
            }
          >
            Log out
          </button>
        </div>
      </aside>
      <main id="main">
        <Outlet context={data.account.id} />
      </main>
    </div>
  );
}
function Home() {
  return (
    <div className="landing">
      <header>
        <Brand />
        <Link to="/account/login">Log in</Link>
      </header>
      <main id="main">
        <div className="hero-art" aria-hidden="true">
          <div>✉</div>
          <b>✧</b>
          <i>✦</i>
        </div>
        <Heading
          eyebrow="CREATE  •  SHARE  •  CONNECT"
          title="Make someone’s day."
        >
          Every connection deserves a little magic.
        </Heading>
        <p className="intro">
          Turn the things you want to say into greetings they’ll want to keep. A
          letter, a memory, or a little surprise—made by you.
        </p>
        <div className="actions">
          <Link className="primary" to="/app/templates">
            Make a greeting <span aria-hidden="true">↗</span>
          </Link>
          <Link className="secondary" to="/help">
            Explore Evermore
          </Link>
        </div>
        <p className="muted small">
          Free to create. No account needed to open a greeting.
        </p>
      </main>
    </div>
  );
}
function App() {
  return (
    <BrowserRouter>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Suspense fallback={<Wait />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/account/:mode" element={<Account />} />
          <Route path="/app" element={<Shell />}>
            <Route index element={<Pages page="dashboard" />} />
            <Route path="templates" element={<Pages page="templates" />} />
            <Route path="creations" element={<Pages page="creations" />} />
            <Route path="inbox" element={<Pages page="inbox" />} />
            <Route
              path="notifications"
              element={<Pages page="notifications" />}
            />
            <Route path="settings" element={<Settings />} />
            <Route path="studio/:id" element={<Studio />} />
          </Route>
          <Route path="/g/:slug" element={<Public page="greeting" />} />
          <Route path="/note/:slug" element={<Public page="inbox" />} />
          <Route path="/people/:slug" element={<Public page="profile" />} />
          <Route path="/help" element={<Public page="help" />} />
          <Route path="/moderation" element={<Public page="moderation" />} />
          <Route
            path="*"
            element={
              <main className="public" id="main">
                <Heading eyebrow="EVERMORE" title="Page not found" />
                <Link to="/">Go home</Link>
              </main>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
