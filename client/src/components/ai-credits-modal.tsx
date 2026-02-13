import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Zap, Star, Crown, Loader2 } from "lucide-react";
import { UseMutationResult } from "@tanstack/react-query";

// Actual payment version:
// interface CreditPackage {
//   id: string;
//   name: string;
//   credits: number;
//   price: number; // in cents
//   description: string;
//   popular?: boolean;
// }

// Actual payment version:
// const CREDIT_PACKAGES: CreditPackage[] = [
//   {
//     id: 'starter',
//     name: 'Starter Pack',
//     credits: 1000,
//     price: 500, // $5.00
//     description: 'Perfect for small projects',
//   },
//   {
//     id: 'professional',
//     name: 'Professional Pack',
//     credits: 5000,
//     price: 2000, // $20.00
//     description: 'Great for active development',
//     popular: true,
//   },
//   {
//     id: 'enterprise',
//     name: 'Enterprise Pack',
//     credits: 15000,
//     price: 5000, // $50.00
//     description: 'For large teams and projects',
//   }
// ];

interface AiCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCredits: number;
  purchaseCreditsMutation: UseMutationResult<any, Error, { packageId: string }, unknown>;
}

export function AiCreditsModal({
  open,
  onOpenChange,
  currentCredits,
  purchaseCreditsMutation,
}: AiCreditsModalProps) {
  // Actual payment version:
  // const [selectedPackage, setSelectedPackage] = useState<string>('professional');
  // const [showPaymentForm, setShowPaymentForm] = useState(false);
  // const [paymentIntent, setPaymentIntent] = useState<any>(null);
  // const [cardDetails, setCardDetails] = useState({
  //   number: '',
  //   expiryMonth: '',
  //   expiryYear: '',
  //   cvc: '',
  //   zip: ''
  // });

  // Actual payment version:
  // const handlePurchase = async () => {
  //   try {
  //     const result = await purchaseCreditsMutation.mutateAsync({ packageId: selectedPackage });
  //     setPaymentIntent(result);
  //     setShowPaymentForm(true);
  //   } catch (error) {
  //     console.error('Failed to create payment intent:', error);
  //   }
  // };

  // Actual payment version:
  // const handlePaymentSubmit = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   
  //   // Validate card details
  //   if (!cardDetails.number || !cardDetails.expiryMonth || !cardDetails.expiryYear || !cardDetails.cvc) {
  //     alert('Please fill in all card details');
  //     return;
  //   }

  //   try {
  //     const response = await fetch('/api/payments/process-test-payment', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Authorization': `Bearer ${localStorage.getItem('token')}`
  //       },
  //       body: JSON.stringify({
  //         paymentIntentId: paymentIntent.clientSecret,
  //         packageId: selectedPackage,
  //         cardDetails: cardDetails
  //       })
  //     });

  //     if (response.ok) {
  //       const result = await response.json();
  //       const successMessage = `🎉 Payment successful!\n\n${result.creditsAdded.toLocaleString()} credits added to your account.\nNew balance: ${result.newBalance.toLocaleString()} credits`;
  //       alert(successMessage);
  //       setShowPaymentForm(false);
  //       onOpenChange(false);
  //       window.location.reload();
  //     } else {
  //       const error = await response.json();
  //       alert(`❌ Payment failed: ${error.error}`);
  //     }
  //   } catch (error) {
  //     console.error('Payment error:', error);
  //     alert('Payment failed. Please try again.');
  //   }
  // };

  // Actual payment version:
  // const formatPrice = (priceInCents: number) => {
  //   return `$${(priceInCents / 100).toFixed(2)}`;
  // };

  // Actual payment version:
  // const getPackageIcon = (packageId: string) => {
  //   switch (packageId) {
  //     case 'starter':
  //       return <Zap className="w-5 h-5" />;
  //     case 'professional':
  //       return <Star className="w-5 h-5" />;
  //     case 'enterprise':
  //       return <Crown className="w-5 h-5" />;
  //     default:
  //       return <Zap className="w-5 h-5" />;
  //   }
  // };

  // Actual payment version:
  // const getPackageColor = (packageId: string) => {
  //   switch (packageId) {
  //     case 'starter':
  //       return 'bg-green-50 border-green-200 hover:border-green-300';
  //     case 'professional':
  //       return 'bg-blue-50 border-blue-200 hover:border-blue-300';
  //     case 'enterprise':
  //       return 'bg-purple-50 border-purple-200 hover:border-purple-300';
  //     default:
  //       return 'bg-gray-50 border-gray-200 hover:border-gray-300';
  //   }
  // };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center space-x-2">
            <CreditCard className="w-5 h-5 text-log-green" />
            <DialogTitle>Purchase AI Credits</DialogTitle>
          </div>
          <DialogDescription>
            {/* Actual payment version: Buy credits to power AI-generated commit summaries and analysis. */}
            AI credits information
          </DialogDescription>
        </DialogHeader>
        
        {/* Actual payment version - Full JSX code:
        {!showPaymentForm ? (
          <div className="space-y-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-graphite">Current Credits</h3>
                  <p className="text-sm text-steel-gray">Available for AI features</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-log-green">{currentCredits.toLocaleString()}</p>
                  <p className="text-xs text-steel-gray">credits</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {CREDIT_PACKAGES.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`cursor-pointer transition-all ${
                    selectedPackage === pkg.id
                      ? 'ring-2 ring-log-green border-log-green'
                      : getPackageColor(pkg.id)
                  }`}
                  onClick={() => setSelectedPackage(pkg.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getPackageIcon(pkg.id)}
                        <CardTitle className="text-lg">{pkg.name}</CardTitle>
                      </div>
                      {pkg.popular && (
                        <Badge variant="default" className="bg-log-green text-white">
                          Popular
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div>
                        <p className="text-3xl font-bold text-graphite">
                          {formatPrice(pkg.price)}
                        </p>
                        <p className="text-sm text-steel-gray">
                          {pkg.credits.toLocaleString()} credits
                        </p>
                      </div>
                      <p className="text-sm text-steel-gray">{pkg.description}</p>
                      <div className="text-xs text-steel-gray">
                        <p>• ~{Math.floor(pkg.credits / 350)} AI summaries</p>
                        <p>• ~{Math.floor(pkg.credits / 1000)} detailed analyses</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-graphite mb-2">How Credits Work</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-steel-gray">
                <div>
                  <p className="font-medium text-graphite">GPT-3.5 Turbo</p>
                  <p>~350 credits per summary</p>
                  <p>Fast and cost-effective</p>
                </div>
                <div>
                  <p className="font-medium text-graphite">GPT-4</p>
                  <p>~1000 credits per summary</p>
                  <p>Most capable analysis</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-medium text-graphite mb-4">Payment Details</h3>
              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="card-number">Card Number</Label>
                    <Input
                      id="card-number"
                      value={cardDetails.number}
                      onChange={(e) => setCardDetails({...cardDetails, number: e.target.value})}
                      className="font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="expiry-month">Month</Label>
                      <Input
                        id="expiry-month"
                        value={cardDetails.expiryMonth}
                        onChange={(e) => setCardDetails({...cardDetails, expiryMonth: e.target.value})}
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <Label htmlFor="expiry-year">Year</Label>
                      <Input
                        id="expiry-year"
                        value={cardDetails.expiryYear}
                        onChange={(e) => setCardDetails({...cardDetails, expiryYear: e.target.value})}
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cvc">CVC</Label>
                    <Input
                      id="cvc"
                      type="password"
                      value={cardDetails.cvc}
                      onChange={(e) => setCardDetails({...cardDetails, cvc: e.target.value})}
                      maxLength={4}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <Label htmlFor="zip">ZIP Code</Label>
                    <Input
                      id="zip"
                      value={cardDetails.zip}
                      onChange={(e) => setCardDetails({...cardDetails, zip: e.target.value})}
                    />
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
        */}
        
        <div className="space-y-6">
          <div className="p-8 bg-primary/10 rounded-lg border border-border">
            <div className="text-center space-y-4">
              <div className="text-6xl font-bold text-log-green mb-4">∞</div>
              <h3 className="text-2xl font-bold text-foreground">
                All users now have infinite tokens!
              </h3>
              <p className="text-lg text-muted-foreground">
                Play with PushLog at your will!
              </p>
            </div>
          </div>
        </div>
        
        {/* Actual payment version - Button section:
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => {
              if (showPaymentForm) {
                setShowPaymentForm(false);
                setPaymentIntent(null);
              } else {
                onOpenChange(false);
              }
            }}
            disabled={purchaseCreditsMutation.isPending}
          >
            {showPaymentForm ? 'Back' : 'Cancel'}
          </Button>
          {!showPaymentForm ? (
            <Button
              onClick={handlePurchase}
              disabled={purchaseCreditsMutation.isPending}
              className="bg-log-green text-white hover:bg-green-600"
            >
              {purchaseCreditsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Purchase ${formatPrice(CREDIT_PACKAGES.find(p => p.id === selectedPackage)?.price || 0)}`
              )}
            </Button>
          ) : (
            <Button
              onClick={handlePaymentSubmit}
              className="bg-log-green text-white hover:bg-green-600"
            >
              Complete Payment
            </Button>
          )}
        </div>
        */}
        
        <div className="flex justify-end space-x-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
