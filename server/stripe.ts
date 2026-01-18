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
    id: 'gpt-5',
    name: 'GPT-5',
    costPerToken: 15, // $0.015 per 1K tokens
    maxTokens: 128000,
    description: 'Advanced GPT-5 model with enhanced capabilities'
  },
  {
    id: 'gpt-5.1',
    name: 'GPT-5.1',
    costPerToken: 20, // $0.02 per 1K tokens
    maxTokens: 128000,
    description: 'Improved GPT-5.1 with better performance'
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    costPerToken: 25, // $0.025 per 1K tokens
    maxTokens: 128000,
    description: 'Latest GPT-5.2 with cutting-edge features'
  },
  {
    id: 'gpt-5.2-codex',
    name: 'GPT-5.2-Codex',
    costPerToken: 30, // $0.03 per 1K tokens
    maxTokens: 128000,
    description: 'Specialized GPT-5.2-Codex optimized for code analysis'
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
