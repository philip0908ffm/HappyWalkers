/**
 * Demo-Daten für Entwicklung und Vorführung: Gruppen in und um Kassel sowie in Frankfurt,
 * mit Gruppenleitungen, wiederkehrenden Terminen und einem „Gemeinsam auf Distanz“-Termin.
 *
 * Idempotent: feste IDs, `onConflictDoNothing`. Mehrfaches Ausführen legt nichts doppelt an.
 * Demo-Personen haben Adressen auf `.invalid` → es werden nie E-Mails an sie verschickt.
 */
import { sql } from 'drizzle-orm';
import { lookupPostalCode } from '../lib/geo.js';
import { berlinParts, berlinToUtc, generateSeriesWalks } from '../services/series.js';
import { db } from './index.js';
import * as s from './schema.js';

const PEOPLE = [
  { id: 'demo-user-renate', name: 'Renate', postalCode: '34117', gender: 'woman', bio: 'Ich gehe seit 10 Jahren jeden Morgen.' },
  { id: 'demo-user-klaus', name: 'Klaus', postalCode: '34119', gender: 'man', bio: 'Früher gelaufen, heute zügig unterwegs.' },
  { id: 'demo-user-ingrid', name: 'Ingrid', postalCode: '34131', gender: 'woman', bio: 'Am liebsten im Bergpark.' },
  { id: 'demo-user-heinz', name: 'Heinz', postalCode: '34117', gender: 'man', bio: null },
  { id: 'demo-user-gisela', name: 'Gisela', postalCode: '34119', gender: 'woman', bio: null },
  { id: 'demo-user-monika', name: 'Monika', postalCode: '60311', gender: 'woman', bio: 'Mainufer bei jedem Wetter.' },
  { id: 'demo-user-peter', name: 'Peter', postalCode: '60311', gender: 'man', bio: null },
] as const;

type Membership = [userId: string, role: 'founder' | 'moderator' | 'member'];

const GROUPS: {
  id: string;
  name: string;
  description: string;
  rules: string;
  joinPolicy: 'open' | 'request' | 'invite';
  womenOnly: boolean;
  postalCode: string;
  inviteCode: string;
  defaultTempo: 'gemuetlich' | 'zuegig' | 'flott';
  members: Membership[];
  series: {
    id: string;
    title: string;
    weekday: number;
    timeOfDay: string;
    durationMinutes: number;
    distanceKm: number;
    tempo: 'gemuetlich' | 'zuegig' | 'flott';
    meetingPointName: string;
    meetingAddress: string;
    meetingDescription: string;
    meetingLat: number;
    meetingLon: number;
  }[];
}[] = [
  {
    id: 'demo-group-karlsaue',
    name: 'Morgenrunde Karlsaue',
    description:
      'Wir gehen jeden Dienstag und Freitag am Vormittag eine Stunde zügig durch die Karlsaue. Neue Gesichter sind herzlich willkommen – kommen Sie einfach mit.',
    rules: 'Wir warten höchstens 5 Minuten. Bitte sagen Sie kurz zu, wenn Sie kommen. Niemand wird zurückgelassen.',
    joinPolicy: 'open',
    womenOnly: false,
    postalCode: '34117',
    inviteCode: 'WALK-KARLSA',
    defaultTempo: 'zuegig',
    members: [
      ['demo-user-renate', 'founder'],
      ['demo-user-heinz', 'moderator'],
      ['demo-user-klaus', 'member'],
      ['demo-user-gisela', 'member'],
    ],
    series: [
      {
        id: 'demo-series-karlsaue-di',
        title: 'Dienstags-Runde in der Karlsaue',
        weekday: 2,
        timeOfDay: '10:00',
        durationMinutes: 60,
        distanceKm: 5.5,
        tempo: 'zuegig',
        meetingPointName: 'Orangerie, Haupteingang',
        meetingAddress: 'An der Karlsaue 20c, 34121 Kassel',
        meetingDescription: 'Wir stehen links neben der großen Treppe. Bänke zum Warten sind vorhanden.',
        meetingLat: 51.3093,
        meetingLon: 9.4946,
      },
      {
        id: 'demo-series-karlsaue-fr',
        title: 'Freitags-Runde in der Karlsaue',
        weekday: 5,
        timeOfDay: '09:30',
        durationMinutes: 60,
        distanceKm: 5,
        tempo: 'gemuetlich',
        meetingPointName: 'Orangerie, Haupteingang',
        meetingAddress: 'An der Karlsaue 20c, 34121 Kassel',
        meetingDescription: 'Wir stehen links neben der großen Treppe.',
        meetingLat: 51.3093,
        meetingLon: 9.4946,
      },
    ],
  },
  {
    id: 'demo-group-vorderer-westen',
    name: 'Feierabend-Walk Vorderer Westen',
    description: 'Nach der Arbeit eine gute Stunde in flottem Schritt durch den Vorderen Westen und den Aschrottpark.',
    rules: 'Bei Dunkelheit bitte helle Kleidung oder eine Leuchtweste tragen. Bitte sagen Sie ab, wenn Sie nicht kommen können.',
    joinPolicy: 'request',
    womenOnly: false,
    postalCode: '34119',
    inviteCode: 'WALK-WESTEN',
    defaultTempo: 'flott',
    members: [
      ['demo-user-klaus', 'founder'],
      ['demo-user-gisela', 'moderator'],
      ['demo-user-heinz', 'member'],
    ],
    series: [
      {
        id: 'demo-series-westen-do',
        title: 'Feierabend-Walk am Donnerstag',
        weekday: 4,
        timeOfDay: '18:00',
        durationMinutes: 60,
        distanceKm: 6,
        tempo: 'flott',
        meetingPointName: 'Bebelplatz, am Brunnen',
        meetingAddress: 'Bebelplatz, 34119 Kassel',
        meetingDescription: 'Treffpunkt ist der Brunnen in der Mitte des Platzes.',
        meetingLat: 51.3157,
        meetingLon: 9.4727,
      },
    ],
  },
  {
    id: 'demo-group-bergpark',
    name: 'Frauen-Walk Bergpark Wilhelmshöhe',
    description:
      'Eine Gruppe nur für Frauen. Wir gehen am Samstagvormittag gemeinsam zügig durch den Bergpark – mit Steigungen, aber ohne Eile.',
    rules: 'Diese Gruppe ist nur für Frauen. Wir gehen gemeinsam los und achten aufeinander.',
    joinPolicy: 'open',
    womenOnly: true,
    postalCode: '34131',
    inviteCode: 'WALK-BERGPK',
    defaultTempo: 'zuegig',
    members: [
      ['demo-user-ingrid', 'founder'],
      ['demo-user-renate', 'member'],
      ['demo-user-gisela', 'member'],
    ],
    series: [
      {
        id: 'demo-series-bergpark-sa',
        title: 'Samstags im Bergpark',
        weekday: 6,
        timeOfDay: '10:00',
        durationMinutes: 75,
        distanceKm: 6.5,
        tempo: 'zuegig',
        meetingPointName: 'Schloss Wilhelmshöhe, Parkplatz',
        meetingAddress: 'Schlosspark 1, 34131 Kassel',
        meetingDescription: 'Am Ende des großen Parkplatzes, beim Wegweiser zum Herkules.',
        meetingLat: 51.3159,
        meetingLon: 9.3926,
      },
    ],
  },
  {
    id: 'demo-group-mainufer',
    name: 'Mainufer-Walk Frankfurt',
    description: 'Zügig am Main entlang, zwischen Eisernem Steg und Friedensbrücke. Danach gern noch auf einen Kaffee.',
    rules: 'Bitte pünktlich sein – wir gehen um halb los. Bei Gewitter fällt der Termin aus.',
    joinPolicy: 'open',
    womenOnly: false,
    postalCode: '60311',
    inviteCode: 'WALK-MNUFER',
    defaultTempo: 'zuegig',
    members: [
      ['demo-user-monika', 'founder'],
      ['demo-user-peter', 'moderator'],
    ],
    series: [
      {
        id: 'demo-series-mainufer-mi',
        title: 'Mittwochs am Main',
        weekday: 3,
        timeOfDay: '09:30',
        durationMinutes: 60,
        distanceKm: 5.5,
        tempo: 'zuegig',
        meetingPointName: 'Eiserner Steg, Nordseite',
        meetingAddress: 'Mainkai, 60311 Frankfurt am Main',
        meetingDescription: 'Direkt am Aufgang zum Eisernen Steg, auf der Altstadt-Seite.',
        meetingLat: 50.1086,
        meetingLon: 8.6836,
      },
    ],
  },
];

/** Nächster Sonntag, 10:00 Uhr Berliner Zeit. */
function nextSunday10(now = new Date()): Date {
  const p = berlinParts(now);
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + i));
    if (d.getUTCDay() === 0) return berlinToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), '10:00');
  }
  throw new Error('unerreichbar');
}

export async function seedDemo(): Promise<void> {
  for (const p of PEOPLE) {
    const place = lookupPostalCode(p.postalCode)!;
    await db
      .insert(s.user)
      .values({ id: p.id, name: p.name, email: `${p.id}@demo.gehmeinsam.invalid`, emailVerified: true })
      .onConflictDoNothing();
    await db
      .insert(s.profile)
      .values({
        userId: p.id,
        displayName: p.name,
        bio: p.bio,
        postalCode: place.postalCode,
        city: place.city,
        district: place.district,
        lat: place.lat,
        lon: place.lon,
        gender: p.gender,
        emailNotifications: false,
        onboardedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  for (const g of GROUPS) {
    const place = lookupPostalCode(g.postalCode)!;
    await db
      .insert(s.groups)
      .values({
        id: g.id,
        name: g.name,
        description: g.description,
        rules: g.rules,
        joinPolicy: g.joinPolicy,
        womenOnly: g.womenOnly,
        postalCode: place.postalCode,
        city: place.city,
        district: place.district,
        lat: place.lat,
        lon: place.lon,
        inviteCode: g.inviteCode,
        defaultTempo: g.defaultTempo,
        createdBy: g.members[0][0],
      })
      .onConflictDoNothing();
    await db
      .insert(s.groupMembers)
      .values(g.members.map(([userId, role]) => ({ groupId: g.id, userId, role, status: 'active' })))
      .onConflictDoNothing();
    for (const ser of g.series) {
      await db
        .insert(s.walkSeries)
        .values({ ...ser, groupId: g.id, description: g.description, createdBy: g.members[0][0] })
        .onConflictDoNothing();
      const [row] = await db.select().from(s.walkSeries).where(sql`${s.walkSeries.id} = ${ser.id}`);
      if (row) await generateSeriesWalks(row);
    }
  }

  // ein paar Zusagen für die nächsten Termine, damit Teilnehmerzahlen sichtbar sind
  for (const g of GROUPS) {
    const next = await db
      .select({ id: s.walks.id })
      .from(s.walks)
      .where(sql`${s.walks.groupId} = ${g.id} and ${s.walks.startsAt} > now() and ${s.walks.status} = 'planned'`)
      .orderBy(s.walks.startsAt)
      .limit(2);
    for (const w of next) {
      await db
        .insert(s.walkRsvps)
        .values(g.members.map(([userId]) => ({ walkId: w.id, userId, status: 'yes' })))
        .onConflictDoNothing();
    }
  }

  // Gemeinsam auf Distanz: gleiche Uhrzeit, jede Person an ihrem Ort
  const kassel = lookupPostalCode('34117')!;
  const startsAt = nextSunday10();
  await db
    .insert(s.walks)
    .values({
      id: 'demo-walk-distanz-sonntag',
      kind: 'distance',
      title: 'Sonntagsrunde – Gemeinsam auf Distanz',
      description:
        'Wir gehen alle am Sonntag um 10 Uhr los – jede und jeder an ihrem eigenen Ort. Danach erzählen wir im Austausch, wie es war, und teilen gern ein Foto.',
      startsAt,
      durationMinutes: 45,
      distanceKm: 4,
      tempo: 'zuegig',
      postalCode: kassel.postalCode,
      city: kassel.city,
      district: kassel.district,
      lat: kassel.lat,
      lon: kassel.lon,
      createdBy: 'demo-user-renate',
    })
    .onConflictDoUpdate({
      target: s.walks.id,
      set: { startsAt, status: 'planned' },
      // nur nachziehen, wenn der alte Termin vorbei ist
      setWhere: sql`${s.walks.startsAt} < now()`,
    });
  await db
    .insert(s.walkRsvps)
    .values(['demo-user-renate', 'demo-user-monika', 'demo-user-ingrid'].map((userId) => ({ walkId: 'demo-walk-distanz-sonntag', userId, status: 'yes' })))
    .onConflictDoNothing();
}
