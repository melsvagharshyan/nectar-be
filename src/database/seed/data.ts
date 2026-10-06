import type { PhotoKey, PortraitKey } from './images.js';

/**
 * Real accounts' companies; the seed only adds data around them. On a fresh database
 * they don't exist yet, so the seed creates these stand-ins (real rows are kept).
 */
export const OWN = {
  broker: { companyId: 'RF-100', employeeId: 'RF-100-E01' },
  partner: { companyId: 'AM-101', employeeId: 'AM-101-E01' },
} as const;

export const OWN_COMPANIES: { id: string; kind: CompanyKind; name: string; contact: string }[] = [
  { id: OWN.broker.companyId, kind: 'rf', name: 'Своё агентство (РФ)', contact: 'Москва' },
  { id: OWN.partner.companyId, kind: 'am', name: 'Своё агентство (AM)', contact: 'Ереван' },
];

export const OWN_OWNERS: { id: string; companyId: string; name: string; phone: string }[] = [
  { id: OWN.broker.employeeId, companyId: OWN.broker.companyId, name: 'Владелец агентства', phone: '' },
  { id: OWN.partner.employeeId, companyId: OWN.partner.companyId, name: 'Владелец агентства', phone: '' },
];

export const DEMO_PASSWORD = 'demo12345';

type CompanyKind = 'rf' | 'am';
type OfferState = 'sent' | 'interested' | 'transferred' | 'closed' | 'unavailable';
type EventType =
  | 'offers_sent' | 'interest' | 'transferred' | 'returned' | 'sold' | 'started'
  | 'request_submitted' | 'request_rejected' | 'offer_submitted' | 'offer_rejected';
type Stage = 'created' | 'pending_review' | 'rejected' | 'in_progress' | 'has_offers' | 'crm' | 'sold';

export const COMPANIES: { id: string; kind: CompanyKind; name: string; contact: string }[] = [
  { id: 'RF-1', kind: 'rf', name: 'Nord Realty', contact: 'Москва · +7 495 120-44-10' },
  { id: 'AM-2', kind: 'am', name: 'Ararat Estate', contact: '+374 10 54-22-18' },
  { id: 'AM-3', kind: 'am', name: 'Cascade Homes', contact: '+374 10 27-90-63' },
];

export const EMPLOYEES: { id: string; companyId: string; name: string; phone: string }[] = [
  { id: 'RF-100-E02', companyId: 'RF-100', name: 'Екатерина Смирнова', phone: '+7 916 402-18-77' },
  { id: 'RF-100-E03', companyId: 'RF-100', name: 'Игорь Белов', phone: '+7 925 311-64-09' },
  { id: 'AM-101-E02', companyId: 'AM-101', name: 'Нарек Аветисян', phone: '+374 91 44-81-20' },
  { id: 'RF-1-E01', companyId: 'RF-1', name: 'Анна Волкова', phone: '+7 903 718-25-41' },
  { id: 'RF-1-E02', companyId: 'RF-1', name: 'Дмитрий Орлов', phone: '+7 926 550-07-13' },
  { id: 'AM-2-E01', companyId: 'AM-2', name: 'Арман Петросян', phone: '+374 93 20-45-67' },
  { id: 'AM-3-E01', companyId: 'AM-3', name: 'Лилит Саргсян', phone: '+374 77 61-30-82' },
];

export const USERS: {
  email: string;
  role: 'broker' | 'partner';
  employeeId: string;
  avatar: PortraitKey;
}[] = [
  { email: 'nord.broker@example.com', role: 'broker', employeeId: 'RF-1-E01', avatar: 'womanBlonde' },
  { email: 'ararat.partner@example.com', role: 'partner', employeeId: 'AM-2-E01', avatar: 'manBeard' },
  { email: 'cascade.partner@example.com', role: 'partner', employeeId: 'AM-3-E01', avatar: 'womanDark' },
];

export const CLIENTS: {
  id: string;
  employeeId: string;
  name: string;
  phone: string;
  email: string;
}[] = [
  { id: 'C-1', employeeId: 'RF-100-E01', name: 'Ольга Кузнецова', phone: '+7 916 220-31-45', email: 'olga.k@example.com' },
  { id: 'C-2', employeeId: 'RF-100-E02', name: 'Сергей Морозов', phone: '+7 903 145-62-80', email: 'morozov.s@example.com' },
  { id: 'C-3', employeeId: 'RF-100-E01', name: 'Марина Лебедева', phone: '+7 925 870-14-02', email: 'm.lebedeva@example.com' },
  { id: 'C-4', employeeId: 'RF-100-E03', name: 'Алексей Новиков', phone: '+7 917 604-55-19', email: 'a.novikov@example.com' },
  { id: 'C-5', employeeId: 'RF-100-E02', name: 'Татьяна Соколова', phone: '+7 926 318-90-77', email: 'sokolova.t@example.com' },
  { id: 'C-6', employeeId: 'RF-1-E01', name: 'Виктор Павлов', phone: '+7 985 402-63-11', email: 'v.pavlov@example.com' },
  { id: 'C-7', employeeId: 'RF-1-E02', name: 'Елена Фёдорова', phone: '+7 915 733-28-54', email: 'e.fedorova@example.com' },
];

export interface SeedProperty {
  id: string;
  companyId: string;
  availability: 'active' | 'draft' | 'sold';
  type: string;
  district: string;
  price: number;
  area: number;
  rooms: number | null;
  floor: number | null;
  floors: number | null;
  ceiling: number | null;
  market: string;
  location: string;
  repair: string;
  furniture: string;
  parking: string;
  bathroom: string;
  balcony: string;
  building: string;
  amenities: string[];
  description: string;
  privateNotes?: string;
  internalAddress?: string;
  photos: PhotoKey[];
  daysAgo: number;
}

export const PROPERTIES: SeedProperty[] = [
  {
    id: 'BR-1', companyId: 'AM-101', availability: 'active', type: 'Квартира', district: 'Арабкир',
    price: 165000, area: 78, rooms: 2, floor: 7, floors: 14, ceiling: 3, market: 'Новостройка',
    location: 'ул. Комитаса', repair: 'Евроремонт', furniture: 'С мебелью', parking: 'Подземная',
    bathroom: '1 совм.', balcony: 'Лоджия', building: 'Монолит',
    amenities: ['Лифт', 'Кондиционер', 'Панорамный вид', 'Закрытая территория'],
    description: 'Светлая квартира в новом доме с закрытым двором. Окна выходят на две стороны, из гостиной открывается вид на горы. Кухня-гостиная, отдельная спальня, встроенные шкафы.',
    privateNotes: 'Собственник готов к торгу до 5 000 $.', internalAddress: 'Комитаса 38, кв. 71',
    photos: ['livingBright', 'kitchenWhite', 'bedroomLight', 'building'], daysAgo: 16,
  },
  {
    id: 'BR-2', companyId: 'AM-101', availability: 'active', type: 'Квартира', district: 'Кентрон',
    price: 179000, area: 72, rooms: 2, floor: 5, floors: 9, ceiling: 3.2, market: 'Вторичный',
    location: 'ул. Абовяна', repair: 'Дизайнерский', furniture: 'С мебелью', parking: 'Во дворе',
    bathroom: '1 разд.', balcony: 'Балкон', building: 'Каменный',
    amenities: ['Кондиционер', 'Индивидуальное отопление', 'Посудомойка', 'Солнечная сторона'],
    description: 'Квартира в каменном доме в самом центре, пять минут пешком до Каскада. Высокие потолки, дизайнерский ремонт, вся техника остаётся.',
    photos: ['livingWarm', 'kitchenWood', 'bedroomSoft'], daysAgo: 14,
  },
  {
    id: 'BR-3', companyId: 'AM-101', availability: 'active', type: 'Квартира', district: 'Давташен',
    price: 205000, area: 104, rooms: 3, floor: 10, floors: 16, ceiling: 3, market: 'Новостройка',
    location: '3-й квартал Давташена', repair: 'Евроремонт', furniture: 'Частично', parking: 'Подземная',
    bathroom: '2+ санузла', balcony: '2 балкона', building: 'Монолит',
    amenities: ['Лифт', 'Панорамный вид', 'Закрытая территория', 'Охрана / Консьерж', 'Кладовая'],
    description: 'Просторная трёхкомнатная квартира для семьи. Две спальни, гостиная с выходом на балкон, два санузла. Во дворе детская площадка, рядом школа и парк.',
    photos: ['livingModern', 'kitchenOpen', 'bedroomHotel', 'livingWindow'], daysAgo: 12,
  },
  {
    id: 'BR-4', companyId: 'AM-101', availability: 'active', type: 'Дом', district: 'Ачапняк',
    price: 395000, area: 240, rooms: 5, floor: null, floors: 2, ceiling: 3.1, market: 'Вторичный',
    location: 'Ачапняк, частный сектор', repair: 'Капитальный', furniture: 'С мебелью', parking: 'Гараж',
    bathroom: '2+ санузла', balcony: 'Балкон', building: 'Каменный',
    amenities: ['Кондиционер', 'Индивидуальное отопление', 'Закрытая территория', 'Солнечная сторона'],
    description: 'Двухэтажный каменный дом с садом и гаражом на две машины. Пять комнат, большая терраса, участок 6 соток с фруктовыми деревьями.',
    privateNotes: 'Документы готовы, возможен быстрый выход на сделку.',
    photos: ['houseStone', 'livingClassic', 'kitchenIsland', 'houseGarden'], daysAgo: 20,
  },
  {
    id: 'BR-5', companyId: 'AM-101', availability: 'active', type: 'Квартира', district: 'Кентрон',
    price: 98000, area: 46, rooms: 1, floor: 3, floors: 9, ceiling: 2.9, market: 'Вторичный',
    location: 'ул. Туманяна', repair: 'Косметический', furniture: 'С мебелью', parking: 'Во дворе',
    bathroom: '1 совм.', balcony: 'Французский', building: 'Каменный',
    amenities: ['Кондиционер', 'Солнечная сторона'],
    description: 'Уютная однокомнатная квартира в центре — удобный вариант под аренду. Тихий двор, рядом Оперный театр и метро.',
    photos: ['studio', 'livingCozy', 'kitchenWhite'], daysAgo: 9,
  },
  {
    id: 'BR-6', companyId: 'AM-101', availability: 'sold', type: 'Пентхаус', district: 'Кентрон',
    price: 520000, area: 165, rooms: 4, floor: 18, floors: 18, ceiling: 3.4, market: 'Новостройка',
    location: 'Северный проспект', repair: 'Дизайнерский', furniture: 'С мебелью', parking: 'Подземная',
    bathroom: '2+ санузла', balcony: 'Лоджия', building: 'Монолит',
    amenities: ['Лифт', 'Кондиционер', 'Панорамный вид', 'Охрана / Консьерж', 'Посудомойка'],
    description: 'Пентхаус на последнем этаже с террасой и видом на Арарат. Четыре комнаты, мастер-спальня с гардеробной, отдельный лифт.',
    photos: ['livingLuxury', 'kitchenIsland', 'bedroomHotel', 'livingLoft'], daysAgo: 24,
  },
  {
    id: 'BR-7', companyId: 'AM-101', availability: 'draft', type: 'Квартира', district: 'Норк-Мараш',
    price: 118000, area: 64, rooms: 2, floor: 4, floors: 10, ceiling: 2.8, market: 'Вторичный',
    location: 'Норк, ул. Гюрджяна', repair: 'Косметический', furniture: 'Частично', parking: 'Наземная',
    bathroom: '1 разд.', balcony: 'Балкон', building: 'Панельный',
    amenities: ['Лифт', 'Солнечная сторона'],
    description: 'Квартира в зелёном районе с видом на город. Готовим к публикации — ждём новые фото после уборки.',
    photos: ['livingGreen', 'bedroomLight'], daysAgo: 2,
  },
  {
    id: 'BR-8', companyId: 'AM-2', availability: 'active', type: 'Квартира', district: 'Кентрон',
    price: 172000, area: 70, rooms: 2, floor: 6, floors: 12, ceiling: 3, market: 'Новостройка',
    location: 'ул. Сарьяна', repair: 'Евроремонт', furniture: 'С мебелью', parking: 'Подземная',
    bathroom: '1 совм.', balcony: 'Лоджия', building: 'Монолит',
    amenities: ['Лифт', 'Кондиционер', 'Охрана / Консьерж'],
    description: 'Современная квартира в клубном доме с консьержем. Продуманная планировка, тёплые полы, панорамные окна в гостиной.',
    photos: ['livingMinimal', 'kitchenOpen', 'bedroomSoft'], daysAgo: 13,
  },
  {
    id: 'BR-9', companyId: 'AM-2', availability: 'active', type: 'Дом', district: 'Давташен',
    price: 420000, area: 230, rooms: 5, floor: null, floors: 3, ceiling: 3, market: 'Новостройка',
    location: 'Давташен, коттеджный посёлок', repair: 'Дизайнерский', furniture: 'Без мебели', parking: 'Гараж',
    bathroom: '2+ санузла', balcony: '2 балкона', building: 'Монолит',
    amenities: ['Закрытая территория', 'Охрана / Консьерж', 'Индивидуальное отопление', 'Панорамный вид'],
    description: 'Новый дом в охраняемом посёлке: бассейн, зона барбекю, кабинет и гостевая комната. Сдан в прошлом году, никто не жил.',
    photos: ['housePool', 'houseModern', 'livingLoft'], daysAgo: 15,
  },
  {
    id: 'BR-10', companyId: 'AM-2', availability: 'active', type: 'Квартира', district: 'Арабкир',
    price: 228000, area: 112, rooms: 3, floor: 8, floors: 12, ceiling: 3, market: 'Новостройка',
    location: 'пр. Баграмяна', repair: 'Евроремонт', furniture: 'С мебелью', parking: 'Подземная',
    bathroom: '2+ санузла', balcony: 'Лоджия', building: 'Монолит',
    amenities: ['Лифт', 'Кондиционер', 'Кладовая', 'Закрытая территория'],
    description: 'Семейная квартира у парка Победы: три спальни, кухня-гостиная 30 м², кладовая и место в паркинге в стоимости.',
    photos: ['livingSofa', 'kitchenWood', 'bedroomLight', 'livingWindow'], daysAgo: 8,
  },
  {
    id: 'BR-11', companyId: 'AM-3', availability: 'active', type: 'Квартира', district: 'Арабкир',
    price: 189000, area: 81, rooms: 2, floor: 9, floors: 14, ceiling: 3, market: 'Новостройка',
    location: 'ул. Киевян', repair: 'Дизайнерский', furniture: 'С мебелью', parking: 'Подземная',
    bathroom: '1 разд.', balcony: 'Лоджия', building: 'Монолит',
    amenities: ['Лифт', 'Кондиционер', 'Посудомойка', 'Панорамный вид'],
    description: 'Дизайнерская квартира с панорамным видом. Натуральные материалы, встроенная техника, просторная лоджия.',
    photos: ['livingClassic', 'kitchenWhite', 'bedroomHotel'], daysAgo: 11,
  },
  {
    id: 'BR-12', companyId: 'AM-3', availability: 'active', type: 'Дом', district: 'Ачапняк',
    price: 360000, area: 200, rooms: 4, floor: null, floors: 2, ceiling: 3, market: 'Вторичный',
    location: 'Ачапняк, у ущелья Раздан', repair: 'Капитальный', furniture: 'Частично', parking: 'Во дворе',
    bathroom: '2+ санузла', balcony: 'Балкон', building: 'Кирпичный',
    amenities: ['Индивидуальное отопление', 'Солнечная сторона', 'Закрытая территория'],
    description: 'Уютный дом с видом на ущелье. Четыре комнаты, камин в гостиной, ухоженный сад и летняя кухня.',
    photos: ['houseFamily', 'houseEvening', 'livingWarm'], daysAgo: 18,
  },
  {
    id: 'BR-13', companyId: 'AM-3', availability: 'active', type: 'Пентхаус', district: 'Кентрон',
    price: 560000, area: 150, rooms: 4, floor: 15, floors: 15, ceiling: 3.5, market: 'Новостройка',
    location: 'ул. Пушкина', repair: 'Дизайнерский', furniture: 'С мебелью', parking: 'Подземная',
    bathroom: '2+ санузла', balcony: 'Лоджия', building: 'Монолит',
    amenities: ['Лифт', 'Кондиционер', 'Панорамный вид', 'Охрана / Консьерж'],
    description: 'Двухуровневый пентхаус с террасой на крыше. Вид на центр и горы, умный дом, два места в паркинге.',
    photos: ['villa', 'livingLuxury', 'kitchenIsland'], daysAgo: 21,
  },
  {
    id: 'BR-14', companyId: 'AM-3', availability: 'active', type: 'Коммерция', district: 'Кентрон',
    price: 290000, area: 120, rooms: null, floor: 2, floors: 6, ceiling: 3.3, market: 'Вторичный',
    location: 'ул. Маштоца', repair: 'Евроремонт', furniture: 'С мебелью', parking: 'Наземная',
    bathroom: '1 разд.', balcony: 'Нет', building: 'Каменный',
    amenities: ['Кондиционер', 'Охрана / Консьерж'],
    description: 'Офис открытой планировки на главном проспекте: переговорная, кухня, отдельный вход. Подходит под студию или представительство.',
    photos: ['officeOpen', 'officeMeeting'], daysAgo: 7,
  },
];

export interface SeedOffer {
  id: string;
  propertyId: string;
  state: OfferState;
  disposition?: 'neutral' | 'rejected';
  closeReason?: 'sold' | 'not_selected';
  /** Admin review; seeded offers are approved unless stated. */
  review?: 'pending' | 'rejected';
  rejectReason?: string;
  daysAgo: number;
}

export interface SeedRequest {
  id: string;
  clientId: string;
  stage: Stage;
  type: string;
  districts: string[];
  budgetMin: number;
  budgetMax: number;
  areaMin: number;
  areaMax: number;
  rooms: number | null;
  goal: string;
  term: string;
  notes: string;
  market: string;
  repair: string;
  furniture: string;
  parking: string;
  view: string;
  amenities: string[];
  daysAgo: number;
  rejectReason?: string;
  offers: SeedOffer[];
  transfer?: { id: string; state: 'demo_transferred' | 'sold'; offerIds: string[]; soldPropertyId?: string; daysAgo: number };
  drafts?: { propertyId: string; companyId: string }[];
  events: { type: EventType; daysAgo: number; propertyId?: string }[];
}

export const REQUESTS: SeedRequest[] = [
  {
    id: 'CR-1', clientId: 'C-1', stage: 'created', type: 'Квартира', districts: ['Кентрон', 'Арабкир'],
    budgetMin: 150000, budgetMax: 230000, areaMin: 70, areaMax: 100, rooms: 3,
    goal: 'Переезд семьи', term: '1–3 месяца', market: 'Не важно', repair: 'Готовый', furniture: 'Не важно',
    parking: 'Нужна', view: 'На горы', amenities: ['Балкон', 'Лифт', 'Рядом школа'],
    notes: 'Семья с двумя детьми переезжает из Москвы. Важно, чтобы рядом была школа с русским языком обучения.',
    daysAgo: 0.2, offers: [], events: [],
  },
  {
    id: 'CR-2', clientId: 'C-2', stage: 'in_progress', type: 'Квартира', districts: ['Кентрон'],
    budgetMin: 70000, budgetMax: 110000, areaMin: 35, areaMax: 55, rooms: 1,
    goal: 'Аренда', term: 'До месяца', market: 'Вторичный', repair: 'Готовый', furniture: 'С мебелью',
    parking: 'Не важно', view: 'Не важно', amenities: ['Тихая улица'],
    notes: 'Покупка под сдачу в аренду, нужен вариант, который можно сдавать сразу.',
    daysAgo: 4, offers: [],
    drafts: [{ propertyId: 'BR-5', companyId: 'AM-101' }],
    events: [{ type: 'started', daysAgo: 3 }],
  },
  {
    id: 'CR-3', clientId: 'C-3', stage: 'has_offers', type: 'Квартира', districts: ['Арабкир', 'Кентрон'],
    budgetMin: 120000, budgetMax: 190000, areaMin: 60, areaMax: 85, rooms: 2,
    goal: 'Для проживания', term: '1–3 месяца', market: 'Не важно', repair: 'Готовый', furniture: 'С мебелью',
    parking: 'Нужна', view: 'На город', amenities: ['Лифт', 'Балкон'],
    notes: 'Работает удалённо, нужна светлая квартира с местом под кабинет.',
    daysAgo: 10,
    offers: [
      { id: 'OF-1', propertyId: 'BR-1', state: 'interested', daysAgo: 8 },
      { id: 'OF-2', propertyId: 'BR-2', state: 'sent', daysAgo: 8 },
      { id: 'OF-3', propertyId: 'BR-8', state: 'sent', daysAgo: 7 },
      { id: 'OF-4', propertyId: 'BR-11', state: 'sent', disposition: 'rejected', daysAgo: 6 },
      // Waiting for admin review: the broker doesn't see these yet.
      { id: 'OF-12', propertyId: 'BR-10', state: 'sent', review: 'pending', daysAgo: 0.5 },
      {
        id: 'OF-13', propertyId: 'BR-5', state: 'sent', review: 'rejected', daysAgo: 2,
        rejectReason: 'Добавьте фото кухни и санузла, укажите год постройки дома.',
      },
    ],
    events: [
      { type: 'started', daysAgo: 9 },
      { type: 'offers_sent', daysAgo: 8 },
      { type: 'offers_sent', daysAgo: 7 },
      { type: 'offers_sent', daysAgo: 6 },
      { type: 'interest', daysAgo: 5, propertyId: 'BR-1' },
      { type: 'offer_submitted', daysAgo: 2, propertyId: 'BR-5' },
      { type: 'offer_rejected', daysAgo: 1.5, propertyId: 'BR-5' },
      { type: 'offer_submitted', daysAgo: 0.5, propertyId: 'BR-10' },
    ],
  },
  {
    id: 'CR-4', clientId: 'C-4', stage: 'crm', type: 'Дом', districts: ['Ачапняк', 'Давташен'],
    budgetMin: 300000, budgetMax: 450000, areaMin: 180, areaMax: 260, rooms: 5,
    goal: 'Переезд семьи', term: 'В течение 3 месяцев', market: 'Не важно', repair: 'Готовый', furniture: 'Не важно',
    parking: 'Нужна', view: 'На горы', amenities: ['Зелёный двор', 'Тихая улица'],
    notes: 'Дом для большой семьи, нужен гараж и сад. Клиент готов прилететь на просмотр.',
    daysAgo: 13,
    offers: [
      { id: 'OF-5', propertyId: 'BR-4', state: 'transferred', daysAgo: 11 },
      { id: 'OF-6', propertyId: 'BR-9', state: 'transferred', daysAgo: 10 },
      { id: 'OF-7', propertyId: 'BR-12', state: 'sent', daysAgo: 10 },
    ],
    transfer: { id: 'TR-1', state: 'demo_transferred', offerIds: ['OF-5', 'OF-6'], daysAgo: 2 },
    events: [
      { type: 'started', daysAgo: 12 },
      { type: 'offers_sent', daysAgo: 11 },
      { type: 'offers_sent', daysAgo: 10.5 },
      { type: 'offers_sent', daysAgo: 10 },
      { type: 'interest', daysAgo: 8, propertyId: 'BR-4' },
      { type: 'interest', daysAgo: 7, propertyId: 'BR-9' },
      { type: 'transferred', daysAgo: 2 },
    ],
  },
  {
    id: 'CR-5', clientId: 'C-5', stage: 'sold', type: 'Пентхаус', districts: ['Кентрон'],
    budgetMin: 400000, budgetMax: 600000, areaMin: 120, areaMax: 180, rooms: 4,
    goal: 'Сохранение капитала', term: 'До месяца', market: 'Новостройка', repair: 'Готовый', furniture: 'С мебелью',
    parking: 'Нужна', view: 'На горы', amenities: ['Лифт'],
    notes: 'Премиальный объект с видом на Арарат, сделка через аккредитив.',
    daysAgo: 22,
    offers: [
      { id: 'OF-8', propertyId: 'BR-6', state: 'closed', closeReason: 'sold', daysAgo: 18 },
      { id: 'OF-9', propertyId: 'BR-13', state: 'closed', closeReason: 'not_selected', daysAgo: 17 },
    ],
    transfer: { id: 'TR-2', state: 'sold', offerIds: ['OF-8', 'OF-9'], soldPropertyId: 'BR-6', daysAgo: 12 },
    events: [
      { type: 'started', daysAgo: 20 },
      { type: 'offers_sent', daysAgo: 18 },
      { type: 'offers_sent', daysAgo: 17 },
      { type: 'interest', daysAgo: 15, propertyId: 'BR-6' },
      { type: 'interest', daysAgo: 14, propertyId: 'BR-13' },
      { type: 'transferred', daysAgo: 12 },
      { type: 'sold', daysAgo: 6, propertyId: 'BR-6' },
    ],
  },
  {
    id: 'CR-6', clientId: 'C-6', stage: 'in_progress', type: 'Коммерция', districts: ['Кентрон'],
    budgetMin: 200000, budgetMax: 350000, areaMin: 80, areaMax: 150, rooms: null,
    goal: 'Бизнес', term: '3–6 месяцев', market: 'Не важно', repair: 'Готовый', furniture: 'Не важно',
    parking: 'Нужна', view: 'Не важно', amenities: [],
    notes: 'Офис под представительство IT-компании на 10–12 рабочих мест.',
    daysAgo: 2, offers: [], events: [{ type: 'started', daysAgo: 1 }],
  },
  {
    id: 'CR-7', clientId: 'C-7', stage: 'has_offers', type: 'Квартира', districts: ['Давташен', 'Арабкир'],
    budgetMin: 160000, budgetMax: 240000, areaMin: 85, areaMax: 120, rooms: 3,
    goal: 'Инвестиции', term: '1–3 месяца', market: 'Новостройка', repair: 'Готовый', furniture: 'Не важно',
    parking: 'Нужна', view: 'На город', amenities: ['Лифт', 'Зелёный двор'],
    notes: 'Рассматривает покупку с последующей сдачей семье экспатов.',
    daysAgo: 7,
    offers: [
      { id: 'OF-10', propertyId: 'BR-3', state: 'sent', daysAgo: 4 },
      { id: 'OF-11', propertyId: 'BR-10', state: 'interested', daysAgo: 3 },
    ],
    events: [
      { type: 'started', daysAgo: 6 },
      { type: 'offers_sent', daysAgo: 4 },
      { type: 'offers_sent', daysAgo: 3 },
      { type: 'interest', daysAgo: 1, propertyId: 'BR-10' },
    ],
  },
  {
    id: 'CR-8', clientId: 'C-1', stage: 'pending_review', type: 'Студия', districts: ['Кентрон'],
    budgetMin: 60000, budgetMax: 90000, areaMin: 25, areaMax: 40, rooms: 0,
    goal: 'Для студента', term: 'До месяца', market: 'Не важно', repair: 'Готовый', furniture: 'С мебелью',
    parking: 'Не важно', view: 'Не важно', amenities: ['Рядом метро'],
    notes: 'Студия для дочери на время учёбы в университете, желательно в пешей доступности от центра.',
    daysAgo: 0.4, offers: [],
    events: [{ type: 'request_submitted', daysAgo: 0.3 }],
  },
  {
    id: 'CR-9', clientId: 'C-2', stage: 'rejected', type: 'Дом', districts: [],
    budgetMin: 0, budgetMax: 400000, areaMin: 0, areaMax: 0, rooms: null,
    goal: 'Для проживания', term: 'Не важно', market: 'Не важно', repair: 'Не важно', furniture: 'Не важно',
    parking: 'Не важно', view: 'Не важно', amenities: [],
    notes: 'Дом за городом.',
    daysAgo: 3,
    rejectReason: 'Укажите районы, площадь и количество комнат — без них партнёры не смогут подобрать варианты.',
    offers: [],
    events: [
      { type: 'request_submitted', daysAgo: 2.9 },
      { type: 'request_rejected', daysAgo: 2.5 },
    ],
  },
];
