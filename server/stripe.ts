import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price: number; // in cents
  description: string;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'starter',
    name: 'Starter Pack',
    credits: 1000,
    price: 500, // $5.00
    description: 'Perfect for small projects'
  },
  {
    id: 'professional',
    name: 'Professional Pack',
    credits: 5000,
    price: 2000, // $20.00
    description: 'Great for active development'
  },
  {
    id: 'enterprise',
    name: 'Enterprise Pack',
    credits: 15000,
    price: 5000, // $50.00
    description: 'For large teams and projects'
  }
];

export interface AiModel {
  id: string;
  name: string;
  costPerToken: number; // cost per 1000 tokens in cents
  maxTokens: number;
  description: string;
}

export const AI_MODELS: AiModel[] = [
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    costPerToken: 25, // $0.025 per 1K tokens
    maxTokens: 128000,
    description: 'Latest GPT-5.2 model with cutting-edge features (Latest & Recommended)'
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    costPerToken: 20, // $0.02 per 1K tokens
    maxTokens: 128000,
    description: 'Improved GPT-5.1 with better performance'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    costPerToken: 5, // $0.005 per 1K tokens (input)
    maxTokens: 128000,
    description: 'Most advanced GPT-4 model with improved performance and lower cost'
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    costPerToken: 3, // $0.003 per 1K tokens
    maxTokens: 128000,
    description: 'Faster and more affordable GPT-4o variant'
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    costPerToken: 10, // $0.01 per 1K tokens
    maxTokens: 128000,
    description: 'GPT-4 Turbo with extended context window'
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    costPerToken: 30, // $0.03 per 1K tokens
    maxTokens: 8192,
    description: 'Original GPT-4 model for complex analysis'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    costPerToken: 1, // $0.0015 per 1K tokens (rounded)
    maxTokens: 16385,
    description: 'Fast and cost-effective for most use cases'
  }
];

export async function createStripeCustomer(email: string, name?: string): Promise<Stripe.Customer> {
  return await stripe.customers.create({
    email,
    name,
  });
}

export async function createPaymentIntent(
  customerId: string,
  packageId: string
): Promise<Stripe.PaymentIntent> {
  const creditPackage = CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
  if (!creditPackage) {
    throw new Error('Invalid credit package');
  }

  return await stripe.paymentIntents.create({
    amount: creditPackage.price,
    currency: 'usd',
    customer: customerId,
    metadata: {
      packageId: creditPackage.id,
      credits: creditPackage.credits.toString(),
    },
  });
}

export async function retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  return await stripe.paymentIntents.retrieve(paymentIntentId);
}

export function calculateTokenCost(modelId: string, tokensUsed: number): number {
  const model = AI_MODELS.find(m => m.id === modelId);
  if (!model) {
    throw new Error('Invalid AI model');
  }
  
  // Calculate cost in units of $0.0001 (costPerToken is in cents per 1K tokens; multiply by 100 to convert cents → $0.0001 units)
  return Math.ceil((tokensUsed / 1000) * model.costPerToken * 100);
}

export { stripe };
