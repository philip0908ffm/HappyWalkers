/**
 * Symbole als Inline-SVG (keine externen Schriftarten oder Dienste).
 * Symbole sind immer dekorativ (aria-hidden) – der Text daneben trägt die Bedeutung.
 */
const paths: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h5v-6h3v6h5V10',
  walk: 'M13 4.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0ZM10 9l-3 3 1 4M10 9l3 1 2 3 3 1M10 9l1 6-2 6M11 15l3 2 1 4',
  group: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.5-3.5 3.2-6 6.5-6s6 2.5 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4c2 .9 3.3 3 3.5 5.6',
  badge: 'M12 2.5 19 5v6c0 4.5-3 8.3-7 10.5C8 19.3 5 15.5 5 11V5l7-2.5ZM9 11.5l2 2 4-4',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM3.5 21c.8-4.2 4.2-7 8.5-7s7.7 2.8 8.5 7',
  plus: 'M12 5v14M5 12h14',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  close: 'M6 6l12 12M18 6 6 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5v.5',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5',
  warning: 'M12 3.5 22 20H2L12 3.5ZM12 10v4.5M12 17v.5',
  calendar: 'M4 6.5h16V20H4zM4 10.5h16M8 4v4M16 4v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  map: 'M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5ZM9 4v13.5M15 6.5V20',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.5M3.5 12h.5M3.5 18h.5',
  search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15ZM16 16l5 5',
  heart: 'M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20Z',
  comment: 'M4 5h16v11H9l-5 4V5Z',
  photo: 'M3 6h18v13H3zM3 15l5-5 4 4 3-3 6 6M15.5 9.5h.5',
  print: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  mail: 'M3 5.5h18v13H3zM3 6l9 7 9-7',
  phone: 'M7 3h10v18H7zM11 18h2',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.7 5.5 3.7 9s-1.2 6.5-3.7 9c-2.5-2.5-3.7-5.5-3.7-9S9.5 5.5 12 3Z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8 20h8M9.5 17h5v3h-5z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  block: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM6.5 6.5h1v1h-1zM16.5 6.5h1v1h-1zM6.5 16.5h1v1h-1z',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2ZM10 20.5a2 2 0 0 0 4 0',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM6 15V9a3 3 0 0 1 3-3h1M18 9v6a3 3 0 0 1-3 3h-1',
  edit: 'M4 20h4l11-11-4-4L4 16v4ZM13.5 6.5l4 4',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16 10.2 11.3 5.5 9.5 10.2 7.7 12 3ZM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z',
  distance: 'M3 12h18M6 8l-3 4 3 4M18 8l3 4-3 4',
  people2: 'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 19c.4-3 2.7-5 5.5-5s5.1 2 5.5 5M10.5 19c.4-3 2.7-5 5.5-5s5.1 2 5.5 5',
};

export type IconName = keyof typeof paths;

export function Icon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={paths[name]} />
    </svg>
  );
}
