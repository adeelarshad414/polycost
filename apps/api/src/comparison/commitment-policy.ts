import { NormalizedWorkloadSpec } from '../nws/nws.types';

export type CommitmentPricingModel = 'reserved-1yr' | 'reserved-3yr' | 'savings-plan';
export type CommitmentWorkloadProfile = NormalizedWorkloadSpec['workloadProfile'];

export function commitmentPricingModelCandidates(
  profile: CommitmentWorkloadProfile | undefined,
): CommitmentPricingModel[] {
  const commitmentPreferencePercent =
    profile?.commitmentPreferencePercent !== undefined
      ? Math.min(100, Math.max(0, profile.commitmentPreferencePercent))
      : undefined;

  if (commitmentPreferencePercent === undefined || commitmentPreferencePercent < 35) {
    return [];
  }

  const environment = profile?.environment;
  const isProduction = environment === 'production';
  const isNonProduction =
    environment === 'development' || environment === 'test' || environment === 'staging';

  if (isNonProduction) {
    return commitmentPreferencePercent >= 85 ? ['savings-plan', 'reserved-1yr'] : [];
  }

  if (isProduction && commitmentPreferencePercent >= 85) {
    return ['reserved-3yr', 'savings-plan', 'reserved-1yr'];
  }

  if (commitmentPreferencePercent >= 65) {
    return ['reserved-1yr', 'savings-plan'];
  }

  return ['savings-plan', 'reserved-1yr'];
}
