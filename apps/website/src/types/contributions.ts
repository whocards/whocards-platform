export interface Contribution {
  createdAt: Date
  id: number
  type: string
  CollectiveId: number
  data: Data
}

export interface Data {
  transaction: Transaction
  fromCollective: Collective
  collective: Collective
}

export interface Collective {
  id: number
  type: string
  slug: string
  name: string
  emails: string[]
}

export interface Transaction {
  id: number
  kind: string
  type: string
  uuid: string
  group: string
  amount: number
  isDebt: boolean
  OrderId: number
  currency: string
  isRefund: boolean
  createdAt: Date
  description: string
  CollectiveId: number
  hostCurrency: string
  CreatedByUserId: number
  FromCollectiveId: number
  amountInHostCurrency: number
  hostFeeInHostCurrency: number
  netAmountInHostCurrency: number
  platformFeeInHostCurrency: number
  netAmountInCollectiveCurrency: number
  amountSentToHostInHostCurrency: number
  paymentProcessorFeeInHostCurrency: number
  formattedAmount: string
}
