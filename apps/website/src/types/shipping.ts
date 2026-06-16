export type CreateNewShippingOrder = {
  original_order_id: string // Mandatory
  shop_setting_id: number // Mandatory (from egon) 1
  business_relationship?: 'b2b' | 'b2c' // Default: "b2c"
  reference_number?: string
  customer_name: string // Mandatory
  customer_surname: string // Mandatory
  customer_phone: string // Mandatory
  customer_email: string // Mandatory
  name: string // Mandatory
  surname: string // Mandatory
  phone: string // Mandatory
  email: string // Mandatory
  company?: string
  street: string // Mandatory
  street_number: string // Mandatory
  entrance_number?: string
  door_number?: string
  city: string // Mandatory
  county?: string
  country: string // Mandatory (ISO 3166-1 alpha-2)
  postal_code: string // Mandatory
  fa_company?: string
  fa_street?: string
  fa_street_number?: string
  fa_city?: string
  fa_country?: string
  fa_postal_code?: string
  fa_ico?: string
  fa_dic?: string
  fa_icdph?: string
  auto_process?: 0 | 1 // Default: 0
  on_label?: string
  gps_lat?: string
  gps_long?: string
  note?: string
  currency?: string
  destination_country_code?: string // ISO 3166-1 alpha-2
  id_delivery: number // Mandatory
  delivery_branch_id?: number
  external_branch_id?: string
  default_tax?: number // Decimal
  id_payment?: number
  payment_cod: 0 | 1 // Mandatory
  cod_price_without_tax?: number // Decimal
  cod_price?: number // Decimal
  deposit_without_tax?: number // Decimal
  deposit?: number // Decimal
  delivery_price_without_tax?: number // Decimal
  delivery_price?: number // Decimal
  payment_price_without_tax?: number // Decimal
  payment_price?: number // Decimal
  discount_price_without_tax?: number // Decimal
  discount_price?: number // Decimal
  min_delivery_date?: string // YYYY-MM-DD
  items: {
    item_id: number // Mandatory
    catalog_id?: string
    name: string // Mandatory
    count: number // Mandatory
    expiration?: 0 | 1 // Default: 0
    exp_value?: string // YYYY-MM-DD, YYYY-MM, YYYY
    price?: number // Decimal
    price_with_tax?: number // Decimal
    tax?: number // Decimal
  }[] // Mandatory
  invoice?: {
    invoice_id?: number
    invoice_date?: string // YYYY-MM-DD
  }
  invoice_url?: string
  fa_print?: 0 | 1 // Default: 0
  attachments?: string[]
  packages?: {
    weight: number // grams
  }[]
}
