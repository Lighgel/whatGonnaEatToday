import { index, real, sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const places = sqliteTable(
  "places",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    cuisine: text("cuisine"),
    area: text("area"),
    address: text("address"),
    priceLevel: integer("price_level"),
    notes: text("notes"),
    source: text("source").notNull(),
    url: text("url"),
    status: text("status").notNull(),
    lastVisitedAt: text("last_visited_at"),
    createdAt: text("created_at").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    amapPoiId: text("amap_poi_id"),
    tel: text("tel"),
    amapRating: real("amap_rating"),
    amapCost: integer("amap_cost"),
    openTime: text("open_time"),
    amapTag: text("amap_tag"),
    amapStatus: text("amap_status"),
  },
  (table) => [
    uniqueIndex("places_name_key_idx").on(table.nameKey),
    index("places_status_idx").on(table.status),
    index("places_area_idx").on(table.area),
    index("places_cuisine_idx").on(table.cuisine),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("tags_name_idx").on(table.name)],
);

export const placeTags = sqliteTable(
  "place_tags",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("place_tags_pk").on(table.placeId, table.tagId),
    index("place_tags_tag_idx").on(table.tagId),
    index("place_tags_place_idx").on(table.placeId),
  ],
);

export const dishes = sqliteTable(
  "dishes",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
  },
  (table) => [index("dishes_place_idx").on(table.placeId)],
);

export const visits = sqliteTable(
  "visits",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    visitedAt: text("visited_at").notNull(),
    note: text("note"),
    dishesEaten: text("dishes_eaten"),
    keep: text("keep"),
    rating: real("rating"),
    perCapita: integer("per_capita"),
  },
  (table) => [index("visits_place_idx").on(table.placeId)],
);

export const geocodes = sqliteTable("geocodes", {
  query: text("query").primaryKey(),
  lat: real("lat"),
  lng: real("lng"),
  label: text("label"),
  updatedAt: text("updated_at").notNull(),
});

export const placeSources = sqliteTable(
  "place_sources",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    externalId: text("external_id"),
    url: text("url"),
  },
  (table) => [
    uniqueIndex("place_sources_place_source_idx").on(table.placeId, table.source),
    index("place_sources_source_idx").on(table.source),
  ],
);
