import type { HydratedDocument, Model } from 'mongoose';
import type mongoose from 'mongoose';

export type PersonDoc = {
  first_name: string;
  sur_name: string;
  alias?: string | null;
  band_member: boolean;
  year_joined?: Date;
  ipi_number?: string | null;
  instrument: mongoose.Types.ObjectId[];
  release_entity: mongoose.Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
};

export type PersonAttrs = Omit<PersonDoc, 'createdAt' | 'updatedAt'>;

export type PersonModel = Model<PersonDoc> & {
  createTyped(attrs: PersonAttrs): Promise<HydratedDocument<PersonDoc>>;
};
