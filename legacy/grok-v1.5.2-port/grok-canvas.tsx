// Stand-in for the "grok/canvas" module so the dashboard runs as a plain React page.
declare const React: any;
export const useState: any = React.useState;
export const useRef: any = React.useRef;
export const useEffect: any = React.useEffect;
export const useMemo: any = React.useMemo;
export const useCallback: any = React.useCallback;

const PAL: Record<string, any> = {
  light: {
    text: { primary: "#131820", secondary: "#465060", tertiary: "#768194", accent: "#2563d4", success: "#0f8a5a", danger: "#d23744", warning: "#b8741a", warningDeep: "#8f5a00" },
    border: { weak: "#dfe3ea", default: "#c4ccd7" },
    bg: { base: "#f5f7fa" },
    dataviz: { categorical: ["#2563d4", "#d97a26", "#13968f"] },
  },
  dark: {
    text: { primary: "#e7eaf0", secondary: "#a2acba", tertiary: "#6e7a8b", accent: "#5c9dff", success: "#2fc37f", danger: "#ff5d68", warning: "#f2b230", warningDeep: "#ffd24a" },
    border: { weak: "#1f2630", default: "#2e3744" },
    bg: { base: "#0d1015" },
    dataviz: { categorical: ["#5c9dff", "#ff9d45", "#2fd3bd"] },
  },
};

const mq = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const mode = (): "light" | "dark" => {
  const a = document.documentElement.getAttribute("data-theme");
  if (a === "dark" || a === "light") return a;
  return mq && mq.matches ? "dark" : "light";
};
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
if (typeof window !== "undefined") {
  if (mq) (mq.addEventListener ? mq.addEventListener("change", notify) : (mq as any).addListener(notify));
  new MutationObserver(notify).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export function useGrokTheme() {
  const m = React.useSyncExternalStore(subscribe, mode, mode);
  return PAL[m];
}

export function Page({ title, summary, children }: { title?: string; width?: string; summary?: string; children?: any }) {
  React.useEffect(() => { if (title) document.title = "BTC Market Dashboard"; }, [title]);
  return <main className="gc-page" aria-label={title} data-summary={summary}>{children}</main>;
}

export function Section({ heading, caption, children }: { heading?: string; caption?: string; children?: any }) {
  return (
    <section className="gc-section">
      {heading ? <h2 className="gc-h">{heading}</h2> : null}
      {caption ? <div className="gc-cap">{caption}</div> : null}
      {children}
    </section>
  );
}

export function Text({ children }: { children?: any }) {
  return <p className="gc-text">{children}</p>;
}

const cellOf = (v: any) => {
  if (v === null || v === undefined) return { node: "" };
  if (React.isValidElement(v)) return { node: v };
  if (typeof v === "object" && !Array.isArray(v) && ("text" in v || "tone" in v)) return { node: v.text ?? "", tone: v.tone };
  return { node: String(v) };
};
export function Table({ columns, rows, align }: { columns: any[]; rows: any[][]; align?: readonly string[] }) {
  const al = (i: number) => (align && align[i] === "end" ? "right" : align && align[i] === "center" ? "center" : "left");
  return (
    <div className="gc-tablewrap">
      <table className="gc-table">
        <thead><tr>{columns.map((c, i) => <th key={i} style={{ textAlign: al(i) }}>{c}</th>)}</tr></thead>
        <tbody>
          {(rows || []).map((r, ri) => (
            <tr key={ri}>{(r || []).map((v, ci) => { const x = cellOf(v); return <td key={ci} className={x.tone ? `gc-t-${x.tone}` : undefined} style={{ textAlign: al(ci) }}>{x.node}</td>; })}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({ lead, tone = "info", children }: { lead?: string; tone?: string; children?: any }) {
  return (
    <div className={`gc-callout gc-c-${tone}`} role="note">
      {lead ? <div className="gc-lead">{lead}</div> : null}
      {children ? <div className="gc-cbody">{children}</div> : null}
    </div>
  );
}

export function BulletList({ items }: { items: any[] }) {
  return <ul className="gc-ul">{(items || []).map((it, i) => <li key={i}>{typeof it === "object" && it && !React.isValidElement(it) && "text" in it ? it.text : it}</li>)}</ul>;
}

export function Segmented({ options, value, onChange }: any) {
  return (
    <div className="gc-seg" role="tablist">
      {(options || []).map((o: any) => { const v = typeof o === "string" ? o : o.value; const l = typeof o === "string" ? o : o.label; return <button key={v} role="tab" aria-selected={v === value} onClick={() => onChange && onChange(v)}>{l}</button>; })}
    </div>
  );
}
