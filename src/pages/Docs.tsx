import { marked } from "marked";
import { useEffect, useMemo, useRef } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { AppLink, Card, Empty } from "../components/ui";
import { usePageName } from "../lib/hooks";

// docs/*.md is the single source: readable on GitHub, rendered here.
const files = import.meta.glob("../../docs/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const DOCS = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, md]) => {
    const slug = path.split("/").pop()!.replace(/^\d+-/, "").replace(/\.md$/, "");
    const title = md.match(/^#\s+(.+)$/m)?.[1] ?? slug;
    return { slug, title, md };
  });

export default function Docs() {
  const { slug = DOCS[0]?.slug } = useParams();
  const nav = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const i = DOCS.findIndex((d) => d.slug === slug);
  const doc = DOCS[i];
  usePageName(doc ? `${doc.title} · Docs` : "Docs");
  const html = useMemo(() => (doc ? (marked.parse(doc.md.replace(/\nNext: .*$/m, ""), { async: false }) as string) : ""), [doc]);

  // keep in-app links inside the router
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      const href = a?.getAttribute("href");
      if (a && href?.startsWith("/") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        nav(href, { viewTransition: true });
      }
    };
    el.addEventListener("click", click);
    return () => el.removeEventListener("click", click);
  }, [nav]);

  return (
    <div className="docs">
      <aside className="docs-nav" aria-label="Docs">
        <span className="kicker">Docs</span>
        {DOCS.map((d, k) => (
          <NavLink key={d.slug} to={`/docs/${d.slug}`} viewTransition className={({ isActive }) => (isActive || (!slug && k === 0) ? "on" : "")}>
            <span className="mono">{String(k + 1).padStart(2, "0")}</span> {d.title}
          </NavLink>
        ))}
      </aside>
      {doc ? (
        <article className="card prose">
          <div ref={box} dangerouslySetInnerHTML={{ __html: html }} />
          <nav className="docs-pager">
            {DOCS[i - 1] ? <AppLink to={`/docs/${DOCS[i - 1].slug}`}>← {DOCS[i - 1].title}</AppLink> : <span />}
            {DOCS[i + 1] && <AppLink to={`/docs/${DOCS[i + 1].slug}`}>{DOCS[i + 1].title} →</AppLink>}
          </nav>
        </article>
      ) : (
        <Card><Empty title="No such page"><AppLink to="/docs" className="btn btn-soft">Docs home</AppLink></Empty></Card>
      )}
    </div>
  );
}
