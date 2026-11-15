import { z } from 'zod';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
export const partnershipDetails = z.object({
 benefits: z.string().trim().max(2000).default(''),
 commitments: z.string().trim().max(2000).default(''),
 start: date.or(z.literal('')).default(''),
 end: date.or(z.literal('')).default(''),
 renewal: date.or(z.literal('')).default(''),
}).refine(v => !v.start || !v.end || v.end >= v.start, 'La fin doit suivre le début.');
export type PartnershipDetails = z.infer<typeof partnershipDetails>;
export const reviewInput = z.object({outcome:z.enum(['positive','adjust','pause']),note:z.string().trim().min(1).max(2000),next_review:date.or(z.literal('')).default('')});
