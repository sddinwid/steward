import { z } from 'zod';

export interface AnalyticalCapability<I, O> { id: string; version: 1; calculate(input: I): O }
const money = z.number().finite().min(0).max(1e9);
export const sharingInput = z.object({
  availableCapacity: money, requiredCapacity: z.number().positive().max(1e9), externalMonthlyCost: money,
  internalMonthlyPayment: money, incrementalMonthlyCost: money, transitionExpense: money,
  horizonMonths: z.number().int().min(1).max(120), avoidableExternalFraction: z.number().min(0).max(1),
  locationCompatible: z.boolean(), currency: z.string().regex(/^[A-Z]{3}$/),
  sensitivity: z.array(z.object({ label: z.string().min(1).max(100), incrementalMonthlyCost: money, transitionExpense: money })).max(5)
}).strict();
export type SharingInput = z.infer<typeof sharingInput>;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const resourceSharing: AnalyticalCapability<SharingInput, ReturnType<typeof calculate>> = {
  id: 'steward.resource-sharing', version: 1, calculate
};
function calculate(raw: SharingInput) {
  const i = sharingInput.parse(raw);
  const sharedCapacity = i.locationCompatible ? Math.min(i.availableCapacity, i.requiredCapacity) : 0;
  const fraction = sharedCapacity / i.requiredCapacity;
  // The fraction of the external bill that can be avoided is an explicit assumption;
  // capacity alone cannot establish a contract's cancellation or pricing terms.
  const avoided = i.externalMonthlyCost * fraction * i.avoidableExternalFraction;
  function scenario(label: string, incremental: number, transition: number) {
    const enabled = sharedCapacity > 0;
    const payment = enabled ? i.internalMonthlyPayment : 0;
    const realCost = enabled ? incremental : 0;
    const upfront = enabled ? transition : 0;
    const consumerMonthlyBenefit = avoided - payment;
    const providerMonthlyBenefit = payment - realCost;
    const ecosystemMonthlyBenefit = avoided - realCost;
    return { label, consumerMonthlyBenefit: round(consumerMonthlyBenefit), providerMonthlyBenefit: round(providerMonthlyBenefit),
      transitionExpense: upfront, ecosystemMonthlyBenefit: round(ecosystemMonthlyBenefit),
      ecosystemHorizonBenefit: round(ecosystemMonthlyBenefit * i.horizonMonths - upfront),
      consumerHorizonBenefit: round(consumerMonthlyBenefit * i.horizonMonths - upfront),
      providerHorizonBenefit: round(providerMonthlyBenefit * i.horizonMonths),
      breakEvenMonths: ecosystemMonthlyBenefit > 0 ? round(upfront / ecosystemMonthlyBenefit) : null };
  }
  return { capabilityId: 'steward.resource-sharing', schemaVersion: 1, currency: i.currency, horizonMonths: i.horizonMonths,
    sharedCapacity, unmetCapacity: i.requiredCapacity - sharedCapacity, avoidedExternalMonthlyCost: round(avoided),
    assumptions: i, baseline: { label: 'Keep external storage', ecosystemHorizonBenefit: 0, consumerHorizonBenefit: 0, providerHorizonBenefit: 0 },
    proposal: scenario('Share internal capacity', i.incrementalMonthlyCost, i.transitionExpense),
    alternatives: i.sensitivity.map(s => scenario(s.label, s.incrementalMonthlyCost, s.transitionExpense)),
    uncertainties: ['External cost avoidance assumes proportional volume pricing and the specified avoidable fraction.',
      'Incremental operating cost is an assumption, separate from observed total warehouse operating cost.',
      'Internal payments cancel at ecosystem level; transition expense is allocated to the consumer once.',
      'Humans must confirm location, transport, service levels, taxes, contracts, safety, and investment approval. No business decision has been executed.'] };
}
