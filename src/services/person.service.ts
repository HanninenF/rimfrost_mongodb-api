import type { FilterQuery, UpdateQuery } from 'mongoose';
import type { PersonDoc } from '../models/model.types';
import { Person } from '../models/person';

export async function updatePersonTyped(
  filter: FilterQuery<PersonDoc>,
  update: UpdateQuery<PersonDoc>,
) {
  return Person.updateOne(filter, update, { runValidators: true });
}
