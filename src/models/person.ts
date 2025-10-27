import {
  model,
  models,
  Schema,
  SchemaTypeOptions,
  type HydratedDocument,
  type InferSchemaType,
} from 'mongoose';
import type { PersonAttrs, PersonDoc, PersonModel } from './model.types';

const personSchema = new Schema<PersonDoc, PersonModel>(
  {
    first_name: { type: String, required: true },
    sur_name: { type: String, required: true },
    alias: { type: String },
    band_member: { type: Boolean, default: false },
    year_joined: {
      type: Date,
      set: (v: unknown) => {
        if (v instanceof Date) return v;
        if (typeof v === 'string' || typeof v === 'number') {
          const s = String(v).trim();
          if (/^\d{4}$/.test(s)) return new Date(Date.UTC(Number(s), 0, 1));
        }
        return v as Date | undefined;
      },
      validate: {
        validator: function (this: HydratedDocument<PersonDoc>, value: Date | undefined) {
          if (!this.band_member && value) return false;
          return true;
        },
        message: 'year_joined can only be submitted if person is band_member',
      },
      required: function (this: HydratedDocument<PersonDoc>) {
        return this.band_member === true;
      },
      index: true,
    } as SchemaTypeOptions<Date>,
    ipi_number: { type: String, default: null },
    instrument: [{ type: Schema.Types.ObjectId, ref: 'Instrument' }],
    release_entity: [{ type: Schema.Types.ObjectId, ref: 'ReleaseEntity' }],
  },
  {
    collation: { locale: 'sv', strength: 2 },
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret: any) => {
        if (ret.year_joined) {
          const d = new Date(ret.year_joined);
          ret.year_joined = d.getUTCFullYear();
        }
        ret.id = ret._id;
        delete ret._id;
      },
    },
  },
);

personSchema.set('toObject', personSchema.get('toJSON'));

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

personSchema.statics.createTyped = function (attrs: PersonAttrs) {
  return this.create(attrs);
};

export const Person =
  (models.Person as PersonModel) || model<PersonDoc, PersonModel>('Person', personSchema);

export type PersonType = InferSchemaType<typeof personSchema>;
