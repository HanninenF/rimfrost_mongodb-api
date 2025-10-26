import 'dotenv/config';
import mongoose from 'mongoose';

export type DatabaseState = {
  isConnected: boolean;
};

const databaseState: DatabaseState = {
  isConnected: false,
};

const isConnected = () =>
  (mongoose.connection.readyState as number) === mongoose.ConnectionStates.connected;

const isDisconnected = () =>
  (mongoose.connection.readyState as number) === mongoose.ConnectionStates.disconnected;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
export const connectDatabase = async (): Promise<void> => {
  try {
    if (databaseState.isConnected || isConnected()) {
      console.log('Database is already connected');
      databaseState.isConnected = true;
      return;
    }

    const url = requireEnv('MONGODB_URI');

    mongoose.set('strictQuery', true);
    await mongoose.connect(url);

    databaseState.isConnected = isConnected();

    console.log('mongoose connected successfully.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Failed to connect to the database: ', msg);
    throw new Error(msg);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    if (isDisconnected()) {
      console.log('Database already disconnected.');
      return;
    }
    await mongoose.disconnect();
    databaseState.isConnected = false;
    console.log('Mongoose disconnected');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error disconnecting from mongoose: ', msg);
    throw new Error(msg);
  }
};
