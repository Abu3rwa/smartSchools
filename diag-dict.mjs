import 'dotenv/config';
import mongoose from 'mongoose';
import DictionaryEntry from './models/DictionaryEntry.js';

await mongoose.connect(process.env.MONGODB_URI);
const entries = await DictionaryEntry.find({}).lean();
for (const e of entries) {
    const ageH = ((Date.now() - new Date(e.fetchedAt).getTime()) / 3600000).toFixed(1);
    console.log(`${e.word} | status=${e.status} | audio="${e.audioUrl}" | fetched ${ageH}h ago | defs=${e.definitions?.length}`);
}
await mongoose.disconnect();
