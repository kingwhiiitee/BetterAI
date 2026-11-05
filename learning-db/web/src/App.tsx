import { useEffect, useState } from "react";
import { RiBookOpenLine, RiLogoutBoxRLine, RiTaskLine, type RemixiconComponentType } from "@remixicon/react";
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
        <div className="min-h-dvh bg-background-full md:flex">
          <aside className="sticky top-0 z-20 flex shrink-0 flex-col border-b border-separator-border bg-background-full/85 backdrop-blur md:h-dvh md:w-56 md:border-b-0 md:border-e md:bg-background-full">
            <div className="flex h-14 items-center gap-2 px-4">
              <a href={href.overview} className="flex items-center gap-2 text-body-semibold text-text-primary">
                <RiBookOpenLine className="size-5 text-foreground-icon-primary" aria-hidden />
                <span>学习知识库</span>
              </a>
              <div className="ms-auto flex items-center gap-2 md:hidden">
                <AccountActions />
              </div>
            </div>
            <nav className="flex gap-1 px-3 pb-2 md:flex-col md:pb-0 md:pt-2">
              <NavLink to={href.overview} active={route.page !== "decisions"} icon={RiBookOpenLine}>
                知识库
              </NavLink>
              <NavLink to={href.decisions} active={route.page === "decisions"} icon={RiTaskLine}>
                待办决策
              </NavLink>
            </nav>
            <div className="mt-auto hidden items-center gap-2 border-t border-separator-border p-3 md:flex">
              <AccountActions />
            </div>
          </aside>
          <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 pb-16 md:px-8">
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

function AccountActions() {
  return (
    <>
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
    </>
  );
}

function NavLink({
  to,
  active,
  icon: Icon,
  children,
}: {
  to: string;
  active: boolean;
  icon: RemixiconComponentType;
  children: string;
}) {
  return (
    <a
      href={to}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-body-2-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring",
        active ? "bg-background-secondary-default text-text-primary" : "text-text-secondary hover:bg-background-secondary-default/60 hover:text-text-primary",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </a>
  );
}
