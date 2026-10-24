import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  console.info(JSON.stringify({ level: 'info', event: 'mongodb_connected', database: mongoose.connection.name }));
}
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
