import Ligdicash from 'ligdicash';
import 'dotenv/config';

export const client = new Ligdicash({
  apiKey: process.env.LIGDICASH_API_KEY || '',
  authToken: process.env.LIGDICASH_AUTH_TOKEN || '',
});