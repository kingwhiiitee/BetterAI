import { useEffect, useState } from "react";
import { RiBookOpenLine, RiLogoutBoxRLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { ThemeToggle } from "@/components/application/theme/theme-toggle";
import { DirectionProvider } from "@/components/foundations/direction/direction";
import { getToken, setToken } from "@/lib/api";
import { useRoute, href } from "@/lib/router";
import { cx } from "@/utils/cx";
import { TokenPage } from "@/pages/TokenPage";
import { OverviewPage } from "@/pages/Overview";
import { CoursePage } from "@/pages/Course";
import { NodePage } from "@/pages/NodePage";
import { DecisionsPage } from "@/pages/Decisions";

function useToken() {
  const [token, set] = useState(getToken);
  useEffect(() => {
    const on = () => set(getToken());
    window.addEventListener("token-change", on);
    return () => window.removeEventListener("token-change", on);
  }, []);
  return token;
}

export default function App() {
  const token = useToken();
  const route = useRoute();
  const [hadToken, setHadToken] = useState(!!token);
  useEffect(() => {
    if (token) setHadToken(true);
  }, [token]);

  return (
    <DirectionProvider locale="zh-CN">
      {!token ? (
        <TokenPage expired={hadToken} />
      ) : (
        <div className="min-h-dvh bg-background-full">
          <header className="sticky top-0 z-20 border-b border-separator-border bg-background-full/85 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
              <a href={href.overview} className="flex items-center gap-2 text-body-semibold text-text-primary">
                <RiBookOpenLine className="size-5 text-foreground-icon-primary" aria-hidden />
                <span className="hidden sm:inline">学习知识库</span>
              </a>
              <nav className="flex items-center gap-1">
                <NavLink to={href.overview} active={route.page !== "decisions"}>
                  知识库
                </NavLink>
                <NavLink to={href.decisions} active={route.page === "decisions"}>
                  待办决策
                </NavLink>
              </nav>
              <div className="ms-auto flex items-center gap-2">
                <ThemeToggle appearance="segmented" size="small" />
                <Button
                  variant="secondary"
                  size="small"
                  iconOnly
                  leadingIcon={RiLogoutBoxRLine}
                  aria-label="退出（清除令牌）"
                  title="退出（清除令牌）"
                  onClick={() => setToken(null)}
                />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 pb-16">
            {route.page === "overview" && <OverviewPage />}
            {route.page === "decisions" && <DecisionsPage />}
            {route.page === "course" && <CoursePage key={route.id} id={route.id} />}
            {route.page === "node" && <NodePage key={route.id} id={route.id} />}
          </main>
        </div>
      )}
    </DirectionProvider>
  );
}

function NavLink({ to, active, children }: { to: string; active: boolean; children: string }) {
  return (
    <a
      href={to}
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-lg px-2.5 py-1 text-body-2-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        active ? "bg-background-secondary-default text-text-primary" : "text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </a>
  );
}
