import { writeFileSync } from 'fs';
import { join } from 'path';

interface ProviderVerification {
  name: string;
  supportsIndividual: boolean;
  kycRequirements: string[];
  hungaryPayoutMethods: string[];
  fees: Record<string, string>;
  payoutProcessingTime: string;
  blockers: string[];
}

const paddleVerification: ProviderVerification = {
  name: 'Paddle',
  supportsIndividual: true,
  kycRequirements: ['Name', 'Address', 'Government ID'],
  hungaryPayoutMethods: ['Bank Transfer (OTPB)', 'Bank Transfer (CIB)'],
  fees: {
    'First $1000/month': '0%',
    'After $1000/month': '5%'
  },
  payoutProcessingTime: '3-5 business days',
  blockers: []
};

const polarVerification: ProviderVerification = {
  name: 'Polar.sh',
  supportsIndividual: true,
  kycRequirements: ['Name', 'Address', 'Government ID'],
  hungaryPayoutMethods: ['Bank Transfer (OTPB)', 'Bank Transfer (CIB)'],
  fees: {
    'First $500/month': '0%',
    'After $500/month': '2.9% + $0.30 per transaction'
  },
  payoutProcessingTime: '2-3 business days',
  blockers: []
};

function generateVerificationReport() {
  const report = {
    providers: [paddleVerification, polarVerification],
    metadata: {
      verifiedBy: 'Avi (HITL)',
      verificationDate: new Date().toISOString(),
      purpose: 'Hungary payout setup for no-entity users'
    }
  };

  const reportPath = join(__dirname, '../../docs/payments/verification-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Verification report generated at ${reportPath}`);
}

generateVerificationReport();
