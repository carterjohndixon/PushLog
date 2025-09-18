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
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    costPerToken: 2, // $0.002 per 1K tokens
    maxTokens: 4096,
    description: 'Fast and cost-effective for most use cases'
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    costPerToken: 30, // $0.03 per 1K tokens
    maxTokens: 8192,
    description: 'Most capable model for complex analysis'
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    costPerToken: 10, // $0.01 per 1K tokens
    maxTokens: 128000,
    description: 'Latest model with extended context'
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
  
  // Calculate cost in cents
  return Math.ceil((tokensUsed / 1000) * model.costPerToken);
}

export { stripe };
