/**
 * supabase/migrations/*.sql → src/lib/supabase/types.ts
 * Migration'lar bellekte gerçek Postgres (PGlite) üzerinde uygulanır, public şema okunur.
 * Çalıştırma: npm run db:types   (migration değişince yeniden çalıştırın)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const TS: Record<string, string> = {
  text: "string", uuid: "string", int4: "number", float8: "number",
  bool: "boolean", timestamptz: "string", jsonb: "Json",
};

async function main() {
  const pg = new PGlite();
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(dir, f), "utf8"));
  }
  const cols = await pg.query<{
    table_name: string; column_name: string; udt_name: string; is_nullable: string; column_default: string | null;
  }>(
    `select c.table_name, c.column_name, c.udt_name, c.is_nullable, c.column_default
       from information_schema.columns c
       join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
      where c.table_schema='public' order by c.table_name, c.ordinal_position`
  );
  const fks = await pg.query<{ tbl: string; col: string; ref: string; refcol: string; name: string }>(
    `select cl.relname tbl, a.attname col, rf.relname ref, ra.attname refcol, c.conname name
       from pg_constraint c
       join pg_class cl on cl.oid=c.conrelid join pg_class rf on rf.oid=c.confrelid
       join pg_namespace n on n.oid=cl.relnamespace
       join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
       join pg_attribute ra on ra.attrelid=c.confrelid and ra.attnum=c.confkey[1]
      where c.contype='f' and n.nspname='public' and array_length(c.conkey,1)=1
      order by 1,5`
  );

  const tables = new Map<string, typeof cols.rows>();
  for (const c of cols.rows) tables.set(c.table_name, [...(tables.get(c.table_name) ?? []), c]);

  let out = `// OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: supabase/migrations/*.sql\n// Yeniden üretmek için: npm run db:types\n\nexport type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\nexport type Database = {\n  public: {\n    Tables: {\n`;
  for (const [name, list] of tables) {
    const ty = (c: (typeof list)[number]) => {
      const t = TS[c.udt_name];
      if (!t) throw new Error(`Bilinmeyen tip ${c.udt_name} (${name}.${c.column_name}) — gen-supabase-types.ts içine ekleyin`);
      return c.is_nullable === "YES" ? `${t} | null` : t;
    };
    const row = list.map((c) => `          ${c.column_name}: ${ty(c)};`).join("\n");
    const ins = list
      .map((c) => {
        const optional = c.is_nullable === "YES" || c.column_default !== null;
        return `          ${c.column_name}${optional ? "?" : ""}: ${ty(c)};`;
      })
      .join("\n");
    const upd = list.map((c) => `          ${c.column_name}?: ${ty(c)};`).join("\n");
    const rel = fks.rows
      .filter((f) => f.tbl === name)
      .map(
        (f) =>
          `          {\n            foreignKeyName: "${f.name}";\n            columns: ["${f.col}"];\n            isOneToOne: false;\n            referencedRelation: "${f.ref}";\n            referencedColumns: ["${f.refcol}"];\n          },`
      )
      .join("\n");
    out += `      ${name}: {\n        Row: {\n${row}\n        };\n        Insert: {\n${ins}\n        };\n        Update: {\n${upd}\n        };\n        Relationships: [${rel ? "\n" + rel + "\n        " : ""}];\n      };\n`;
  }
  out += `    };\n    Views: { [_ in never]: never };\n    Functions: { [_ in never]: never };\n    Enums: { [_ in never]: never };\n    CompositeTypes: { [_ in never]: never };\n  };\n};\n\nexport type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];\nexport type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];\nexport type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];\n`;
  writeFileSync(join(process.cwd(), "src", "lib", "supabase", "types.ts"), out);
  console.log(`types.ts üretildi: ${tables.size} tablo, ${fks.rows.length} FK`);
}
main();
