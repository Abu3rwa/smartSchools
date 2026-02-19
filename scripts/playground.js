import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function main() { 
    const res = await client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'user', content: 'Hello, world!' }
        ]
    });
    console.log(res.choices?.[0]?.message?.content || res);
}

main().catch(console.error);