import { useEffect, useState } from "react";

export type Route =
  | { page: "overview" }
  | { page: "course"; id: number }
  | { page: "node"; id: number }
  | { page: "decisions" }
  | { page: "dashboard" };

// Hash routing, so the Worker's SPA fallback never has to know about client routes.
function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "course" && parts[1]) return { page: "course", id: Number(parts[1]) };
  if (parts[0] === "node" && parts[1]) return { page: "node", id: Number(parts[1]) };
  if (parts[0] === "decisions") return { page: "decisions" };
  if (parts[0] === "courses") return { page: "overview" };
  return { page: "dashboard" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const href = {
  overview: "#/courses",
  course: (id: number) => `#/course/${id}`,
  node: (id: number) => `#/node/${id}`,
  decisions: "#/decisions",
  dashboard: "#/",
};
