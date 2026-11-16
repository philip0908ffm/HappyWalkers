import { useEffect, useRef, useState } from 'react';

/**
 * Schlichte, gut lesbare Diagramme ohne Bibliothek (Paket E).
 *
 * BarChart: waagerechte Balken als Tabelle – jede Zeile hat Beschriftung, Balken (SVG, dekorativ)
 * und den Wert als Text. Damit ist das Diagramm zugleich die Datentabelle für Screenreader,
 * und die Schrift wächst mit Schriftgröße und Browser-Zoom mit.
 *
 * LineChart: Linie in Bildschirmpunkten gezeichnet (Schrift so groß wie der Text der Seite),
 * erster, letzter und höchster Wert direkt beschriftet; darunter IMMER eine Datentabelle.
 */
export interface ChartDatum {
  label: string;
  value: number;
}

export function BarChart({
  title,
  data,
  format,
  labelHeader,
  valueHeader,
  summary,
}: {
  title: string;
  data: ChartDatum[];
  format: (v: number) => string;
  labelHeader: string;
  valueHeader: string;
  summary?: string;
}) {
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <figure className="chart">
      <table className="chart-bars">
        <caption className="chart__title">{title}</caption>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">{labelHeader}</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const pct = max > 0 ? (d.value / max) * 100 : 0;
            return (
              <tr key={i}>
                <th scope="row" className="chart-bars__label">
                  {d.label}
                </th>
                <td className="chart-bars__cell">
                  <svg className="chart-bars__track" aria-hidden="true" focusable="false" preserveAspectRatio="none" viewBox="0 0 100 10">
                    {pct > 0 ? <rect x={0} y={0} width={Math.max(pct, 1)} height={10} rx={1.2} className="chart-bars__bar" /> : null}
                  </svg>
                  <span className="chart-bars__value">{format(d.value)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {summary ? <figcaption className="chart__summary">{summary}</figcaption> : null}
    </figure>
  );
}

export function LineChart({
  title,
  data,
  format,
  labelHeader,
  valueHeader,
  summary,
}: {
  title: string;
  data: ChartDatum[];
  format: (v: number) => string;
  labelHeader: string;
  valueHeader: string;
  summary?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [fontPx, setFontPx] = useState(18);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(Math.max(240, el.clientWidth));
      setFontPx(parseFloat(getComputedStyle(document.documentElement).fontSize) || 18);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = data.map((d) => d.value);
  const hasData = values.some((v) => v > 0);
  const pad = { top: fontPx * 2, bottom: fontPx * 2.2, left: fontPx * 0.8, right: fontPx * 0.8 };
  const height = Math.round(fontPx * 13);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const vmax = Math.max(...values, 0) * 1.1 || 1;
  const vmin = Math.max(0, Math.min(...values.filter((v) => v > 0), vmax) * 0.8);
  const x = (i: number) => pad.left + (data.length <= 1 ? innerW / 2 : (innerW * i) / (data.length - 1));
  const y = (v: number) => pad.top + innerH - ((v - vmin) / (vmax - vmin || 1)) * innerH;

  // nur Punkte mit Wert verbinden (Wochen ohne Walk haben kein Tempo)
  const pts = data.map((d, i) => ({ i, v: d.value })).filter((p) => p.v > 0);
  const path = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const maxIdx = pts.length ? pts.reduce((a, b) => (b.v > a.v ? b : a)).i : -1;
  const labelled = new Set([pts[0]?.i, pts[pts.length - 1]?.i, maxIdx].filter((n) => n !== undefined && n >= 0));

  return (
    <figure className="chart">
      <figcaption className="chart__title">{title}</figcaption>
      <div ref={wrapRef} className="chart-line">
        {hasData ? (
          <svg width={width} height={height} aria-hidden="true" focusable="false" style={{ fontSize: fontPx }}>
            <line x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} className="chart-line__axis" />
            <path d={path} className="chart-line__path" />
            {pts.map((p) => (
              <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={fontPx * 0.32} className="chart-line__dot" />
            ))}
            {[...labelled].map((i) => {
              const anchor = i === 0 && data.length > 1 ? 'start' : i === data.length - 1 && data.length > 1 ? 'end' : 'middle';
              return (
                <text key={`v${i}`} x={x(i)} y={y(values[i]) - fontPx * 0.7} textAnchor={anchor} className="chart-line__value">
                  {format(values[i])}
                </text>
              );
            })}
            {data.length > 0 ? (
              <>
                <text x={pad.left} y={height - fontPx * 0.5} textAnchor="start" className="chart-line__label">
                  {data[0].label}
                </text>
                {data.length > 1 ? (
                  <text x={width - pad.right} y={height - fontPx * 0.5} textAnchor="end" className="chart-line__label">
                    {data[data.length - 1].label}
                  </text>
                ) : null}
              </>
            ) : null}
          </svg>
        ) : null}
      </div>
      {summary ? <p className="chart__summary">{summary}</p> : null}
      <div className="table-wrap">
        <table className="data chart-table">
          <thead>
            <tr>
              <th scope="col">{labelHeader}</th>
              <th scope="col">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <th scope="row">{d.label}</th>
                <td>{d.value > 0 ? format(d.value) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
