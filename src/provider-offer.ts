import { z } from 'zod';
const field = z.string().trim().max(1000).default('');
export const providerOffer = z.object({ activities:field, area:field, seasons:field, languages:field, audience:field, benefits:field });
