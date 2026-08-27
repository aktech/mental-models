import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const models = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/models' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().default(0),
    /** why this entry exists, when it answers a specific problem rather than a general one */
    background: z.string().optional(),
    /** the issue or thread it answers */
    issue: z.string().url().optional(),
  }),
});

export const collections = { models };
