### 1) Discriminators (rekommenderas)

- Skapa ett **bas-schema** `Instrument` med fält som alla delar: `instrument_type`, `brand`,
  `model`, `color` (och såklart det automatiska `_id`).
- Lägg till **discriminatorKey** (t.ex. `instrument_type`).
- Skapa **specialiserade modeller** som “ärver” basen:

  - `Guitar` / `Bass`: lägger till `tuning`, `string_spec`
  - `DrumShell`: lägger till `diameter`, `depth`
  - `Cymbal`: lägger till `diameter`, `weight_class`

- Fördelar: – Typ-specifika fält och validering per typ – Alla dokument kan ligga i **samma
  collection** (enkelt att lista “alla instrument”), men med tydlig typ – Bra prestanda och enkel
  `find()`/`populate()`

### 2) En “bred” schema med valfria fält + egen validering

- Ett enda schema med _alla_ fält (`tuning`, `string_spec`, `diameter`, `depth`, `weight_class`) och
  en validerare som kräver “rätt fält för rätt typ”.
- Fördel: väldigt enkelt att börja med.
- Nackdel: fält som inte hör ihop finns överallt; validering blir lätt rörig.

### 3) Separata collections per typ

- Egen collection för `guitars`, `basses`, `drum_shells`, `cymbals`.
- Fördel: strikt separerat, kan ha helt olika index/livscykler.
- Nackdel: att visa “alla instrument” kräver flera queries/aggregation.

---

## Praktiska tips (oavsett val)

- **`instrument_type`**: håll det till en kontrollerad lista (t.ex.
  `'guitar' | 'bass' | 'drum_shell' | 'cymbal'`).
- **Måtten**: lagra `diameter`, `depth` som **nummer i mm** (eller tum) och dokumentera enheten –
  konsekvens är allt.
- **`weight_class`**: gör som enum (t.ex. `'thin' | 'medium' | 'heavy'`) så blir filtrering lätt.
- **Unika kombinationer**: om det är viktigt, sätt index som `unique` på t.ex.
  `{ instrument_type, brand, model }`.
- **`_id`**: skapa inget eget `id`—MongoDB gör `_id` (ObjectId) automatiskt. Vill du ha “id” i
  JSON-svar kan du lägga en virtual som mappar `_id` → `id`.
- **Validera beroende på typ**: med discriminators får du “rätt” required-fält för varje typ, vilket
  minskar specialfall i din app-logik.

  Toppen! Här är en **ren Mongoose-lösning med discriminators** – en fil per modell. Exemplet är i
  **TypeScript**, men funkar likadant i JS (ta bort typerna).

---

### 🗂️ Föreslagen struktur

```
src/
├─ config/
│  └─ database.ts
├─ models/
│  ├─ Instrument.base.ts
│  └─ instruments/
│     ├─ Guitar.ts
│     ├─ Bass.ts
│     ├─ DrumShell.ts
│     └─ Cymbal.ts
└─ server.ts
```

---

### `config/database.ts`

```ts
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

export async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ MongoDB connected');
}
```

---

### `models/Instrument.base.ts` _(bas + discriminatorKey)_

```ts
import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Enum för typer
export const instrumentTypes = ['guitar', 'bass', 'drum_shell', 'cymbal'] as const;
export type InstrumentType = (typeof instrumentTypes)[number];

// Bas-schema (fält som alla instrument delar)
const instrumentBase = new Schema(
  {
    instrument_type: {
      type: String,
      required: true,
      enum: instrumentTypes,
    },
    brand: { type: String, required: true },
    model: { type: String, required: true },
    color: { type: String },
  },
  {
    timestamps: true,
    discriminatorKey: 'instrument_type',
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
      },
    },
  },
);

// Exempel-index (undvik dubletter av exakt samma instrument-spec)
instrumentBase.index(
  { instrument_type: 1, brand: 1, model: 1, color: 1 },
  { unique: false }, // sätt true om du vill tvinga unika kombinationer
);

export type InstrumentBase = InferSchemaType<typeof instrumentBase>;
export const Instrument: Model<InstrumentBase> = mongoose.model('Instrument', instrumentBase);
```

---

### `models/instruments/Guitar.ts`

```ts
import { Schema } from 'mongoose';
import { Instrument } from '../Instrument.base';

// Gitarr (och bas) delar fälten tuning + string_spec
const guitarSchema = new Schema({
  tuning: { type: String }, // t.ex. "E Standard", "D Standard", "Drop C"
  string_spec: { type: String }, // t.ex. "10–46", "11–52"
});

export const Guitar = Instrument.discriminator('guitar', guitarSchema);
```

---

### `models/instruments/Bass.ts`

```ts
import { Schema } from 'mongoose';
import { Instrument } from '../Instrument.base';

const bassSchema = new Schema({
  tuning: { type: String }, // t.ex. "E Standard", "Drop D"
  string_spec: { type: String }, // t.ex. "45–105"
});

export const Bass = Instrument.discriminator('bass', bassSchema);
```

---

### `models/instruments/DrumShell.ts`

```ts
import { Schema } from 'mongoose';
import { Instrument } from '../Instrument.base';

// Trumskalp (puka/virvel/bastrumma)
const drumShellSchema = new Schema({
  diameter: { type: Number, required: true }, // mm eller tum – välj EN enhet och dokumentera!
  depth: { type: Number, required: true }, // mm/tum
});

export const DrumShell = Instrument.discriminator('drum_shell', drumShellSchema);
```

---

### `models/instruments/Cymbal.ts`

```ts
import { Schema } from 'mongoose';
import { Instrument } from '../Instrument.base';

const weightClasses = ['thin', 'medium', 'heavy'] as const;

const cymbalSchema = new Schema({
  diameter: { type: Number, required: true }, // mm eller tum (var konsekvent)
  weight_class: { type: String, enum: weightClasses }, // enum underlättar filtrering
});

export const Cymbal = Instrument.discriminator('cymbal', cymbalSchema);
```

---

### `server.ts` _(snabb demo)_

```ts
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database';
import { Guitar } from './models/instruments/Guitar';
import { Cymbal } from './models/instruments/Cymbal';
import { Instrument } from './models/Instrument.base';

const app = express();
app.use(cors());
app.use(express.json());

await connectDB();

// Skapa några instrument
app.post('/seed', async (_req, res) => {
  await Guitar.create({
    instrument_type: 'guitar',
    brand: 'ESP',
    model: 'Horizon',
    color: 'Black',
    tuning: 'D Standard',
    string_spec: '11–52',
  });

  await Cymbal.create({
    instrument_type: 'cymbal',
    brand: 'Zildjian',
    model: 'K Custom Dark Crash',
    color: 'Traditional',
    diameter: 18,
    weight_class: 'thin',
  });

  res.json({ ok: true });
});

// Hämta alla instrument (alla typer i samma collection)
app.get('/instruments', async (_req, res) => {
  const all = await Instrument.find().lean();
  res.json(all);
});

// Filtrera på typ
app.get('/instruments/:type', async (req, res) => {
  const type = req.params.type;
  const items = await Instrument.find({ instrument_type: type }).lean();
  res.json(items);
});

app.listen(3000, () => console.log('🚀 http://localhost:3000'));
```

---

## Varför detta upplägg?

- **Discriminators** ger “rätt” fält/validering per typ utan att splittra allt i olika collections.
- **Enkel querying**: lista **alla instrument** från samma collection, eller filtrera på
  `instrument_type`.
- **Tydlig struktur**: en fil per modell; basal logik i `Instrument.base`.
- **Snyggt JSON-svar**: `id` i stället för `_id`, inget `__v`.

Vill du att jag lägger till **Zod-validering**, **DTO-typer**, eller **service-lager** för snyggare
API-gränssnitt?

Här kommer ny mappstruktur: Ja! Det är precis rätt tänkt. Flytta “mönstren” till små, återanvändbara
helpers/plugins så blir dina **models** tunna och konsekventa. Här är ett upplägg jag brukar använda
i Mongoose + TS:

# 📦 Mappstruktur (förslag)

```
src/
├─ models/
│  ├─ person.model.ts
│  ├─ record.model.ts
│  └─ ...
├─ model-kit/
│  ├─ plugins/
│  │  ├─ collationSv.ts
│  │  ├─ toJSONid.ts
│  │  └─ leanTransform.ts
│  ├─ fields/
│  │  └─ yearOnlyDate.ts
│  ├─ utils/
│  │  ├─ conditional.ts
│  │  └─ createModel.ts
│  └─ repo/
│     └─ baseRepo.ts
```

# 🧩 Återanvändbara byggstenar

### 1) Fält: “år som Date” (med validering + setter)

```ts
// model-kit/fields/yearOnlyDate.ts
import type { HydratedDocument, SchemaTypeOptions } from 'mongoose';

export function yearOnlyDate<T extends { [k: string]: any }>(opts?: {
  requiredWhen?: (doc: HydratedDocument<T>) => boolean;
  forbiddenWhen?: (doc: HydratedDocument<T>) => boolean;
}): SchemaTypeOptions<Date> {
  return {
    type: Date,
    set: (v: unknown) => {
      if (v instanceof Date) return v;
      if (typeof v === 'string' || typeof v === 'number') {
        const s = String(v).trim();
        if (/^\d{4}$/.test(s)) return new Date(Date.UTC(Number(s), 0, 1));
      }
      return v as Date | undefined;
    },
    validate: opts?.forbiddenWhen
      ? {
          validator(this: HydratedDocument<T>, value: Date | undefined) {
            if (!value) return true;
            return !opts!.forbiddenWhen!(this);
          },
          message: 'Field is not allowed in current state.',
        }
      : undefined,
    required(this: HydratedDocument<T>) {
      return opts?.requiredWhen ? !!opts.requiredWhen(this) : false;
    },
    index: true,
  };
}
```

### 2) Utils: villkorliga regler (läsbarhet)

```ts
// model-kit/utils/conditional.ts
import type { HydratedDocument } from 'mongoose';

export const requiredWhen = <T>(pred: (doc: HydratedDocument<T>) => boolean) =>
  function (this: HydratedDocument<T>) {
    return pred(this);
  };

export const forbiddenWhen = <T>(pred: (doc: HydratedDocument<T>) => boolean) =>
  function (this: HydratedDocument<T>, value: unknown) {
    return pred(this) ? value == null : true;
  };
```

### 3) Plugin: svensk collation som default

```ts
// model-kit/plugins/collationSv.ts
import type { Schema } from 'mongoose';
export function collationSv(schema: Schema) {
  schema.set('collation', { locale: 'sv', strength: 2 });
}
```

### 4) Plugin: snyggare JSON (`id` i stället för `_id`, behåll virtuals)

```ts
// model-kit/plugins/toJSONid.ts
import type { Schema } from 'mongoose';
export function toJSONid(schema: Schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: any) => {
      ret.id = ret._id;
      delete ret._id;
    },
  });
  // Gör toObject likadant
  schema.set('toObject', schema.get('toJSON'));
}
```

### 5) Plugin: lean-transform (om du ofta kör `.lean()` men vill ha `id`)

```ts
// model-kit/plugins/leanTransform.ts
import type { Query } from 'mongoose';
export function applyLeanId<T extends Query<any, any>>(q: T) {
  return q.lean({
    virtuals: true,
    transform: (doc: any) => {
      if (doc && doc._id && !doc.id) {
        doc.id = doc._id;
        delete doc._id;
      }
      return doc;
    },
  });
}
```

### 6) Utils: skapa modell utan OverwriteModelError

```ts
// model-kit/utils/createModel.ts
import mongoose, { type Model, type Schema } from 'mongoose';
export function createModel<TDoc, TModel extends Model<TDoc>>(
  name: string,
  schema: Schema<TDoc, TModel>,
) {
  return (mongoose.models[name] as TModel) || mongoose.model<TDoc, TModel>(name, schema);
}
```

### 7) Repo-bas (frivilligt, ger konsekventa metoder)

```ts
// model-kit/repo/baseRepo.ts
import type { FilterQuery, UpdateQuery, Model } from 'mongoose';
export class BaseRepo<TDoc> {
  constructor(protected model: Model<TDoc>) {}
  find(filter: FilterQuery<TDoc>) {
    return this.model.find(filter);
  }
  findOne(filter: FilterQuery<TDoc>) {
    return this.model.findOne(filter);
  }
  updateOne(filter: FilterQuery<TDoc>, update: UpdateQuery<TDoc>) {
    return this.model.updateOne(filter, update, { runValidators: true });
  }
}
```

# 👤 Person-modellen – nu supertunn

```ts
// models/person.model.ts
import mongoose, { Schema, type HydratedDocument } from 'mongoose';
import type { PersonAttrs, PersonDoc, PersonModel } from './model.types';
import { createModel } from '../model-kit/utils/createModel';
import { collationSv } from '../model-kit/plugins/collationSv';
import { toJSONid } from '../model-kit/plugins/toJSONid';
import { yearOnlyDate } from '../model-kit/fields/yearOnlyDate';

const personSchema = new Schema<PersonDoc, PersonModel>({
  first_name: { type: String, required: true },
  sur_name: { type: String, required: true },
  alias: { type: String },
  band_member: { type: Boolean, default: false },

  year_joined: yearOnlyDate<PersonDoc>({
    requiredWhen: (doc) => doc.band_member === true,
    forbiddenWhen: (doc) => doc.band_member === false,
  }),

  ipi_number: { type: String, default: null },
  instrument: [{ type: Schema.Types.ObjectId, ref: 'Instrument' }],
  release_entity: [{ type: Schema.Types.ObjectId, ref: 'ReleaseEntity' }],
});

// Plugins
personSchema.plugin(collationSv);
personSchema.plugin(toJSONid);

// Index
personSchema.index(
  { first_name: 1, sur_name: 1 },
  { unique: true, collation: { locale: 'sv', strength: 2 } },
);
personSchema.index({ first_name: 'text', sur_name: 'text' }, { default_language: 'swedish' });
personSchema.index({ band_member: 1, year_joined: 1 });
personSchema.index(
  { ipi_number: 1 },
  { unique: true, partialFilterExpression: { ipi_number: { $type: 'string' } } },
);

// Statics
personSchema.statics.createTyped = function (attrs: PersonAttrs) {
  return this.create(attrs);
};

export const Person = createModel<PersonDoc, PersonModel>('Person', personSchema);
```

# 💡 Varför detta är nice

- **Läsbar models-kod:** bara fälten + vad som är specifikt för entiteten.
- **Återanvändbara byggstenar:** `yearOnlyDate` kan du återanvända i t.ex. `release_year`,
  `founded_year`, `died_year` osv.
- **Konsekvent JSON/ID:** samma `toJSON` i alla modeller med en enkel plugin.
- **Språkstöd:** svensk collation på alla queries via plugin.
- **Testbart & rent:** repo/service-lager håller “arbete” borta från modellerna.

Vill du att jag gör motsvarande **Record/Credit/Instrument** med samma kit (och
instrument-discriminators) i samma stil?
