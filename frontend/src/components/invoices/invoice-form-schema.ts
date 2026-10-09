import { z } from 'zod'
import { CURRENCIES, type CreateInvoicePayload, type Currency, type InvoiceDetail } from '../../types/invoice'

const optionalText = z.string().trim().max(500).optional()

// Mirrors the backend rules so users get feedback before submitting.
// The server still validates everything and is the source of truth.
export const invoiceFormSchema = z
  .object({
    customer: z.object({
      fullname: z.string().trim().min(1, 'Customer name is required').max(200),
      email: z.string().trim().min(1, 'Customer email is required').email('Enter a valid email address'),
      mobileNumber: z.string().trim().max(30).optional(),
      address: optionalText,
    }),
    invoiceNumber: z.string().trim().min(1, 'Invoice number is required').max(50),
    invoiceReference: z.string().trim().max(100).optional(),
    invoiceDate: z.string().min(1, 'Invoice date is required'),
    dueDate: z.string().min(1, 'Due date is required'),
    currency: z.enum(CURRENCIES, 'Choose a currency'),
    description: z.string().trim().max(1000).optional(),
    item: z.object({
      name: z.string().trim().min(1, 'Item name is required').max(200),
      quantity: z.coerce
        .number('Quantity is required')
        .int('Quantity must be a whole number')
        .positive('Quantity must be at least 1'),
      rate: z.coerce.number('Rate is required').positive('Rate must be greater than 0'),
    }),
    taxRate: z.coerce.number('Tax must be a number').min(0, 'Tax cannot be negative').max(100, 'Tax cannot exceed 100%'),
    discount: z.coerce.number('Discount must be a number').min(0, 'Discount cannot be negative'),
  })
  .refine((v) => !v.invoiceDate || !v.dueDate || v.dueDate >= v.invoiceDate, {
    path: ['dueDate'],
    message: 'Due date must be on or after the invoice date',
  })

export type InvoiceFormInput = z.input<typeof invoiceFormSchema>
export type InvoiceFormValues = z.output<typeof invoiceFormSchema>

const blankToUndefined = (value?: string) => (value ? value : undefined)

export function toCreatePayload(values: InvoiceFormValues): CreateInvoicePayload {
  return {
    invoiceNumber: values.invoiceNumber,
    invoiceReference: blankToUndefined(values.invoiceReference),
    invoiceDate: values.invoiceDate,
    dueDate: values.dueDate,
    currency: values.currency,
    description: blankToUndefined(values.description),
    customer: {
      fullname: values.customer.fullname,
      email: values.customer.email,
      mobileNumber: blankToUndefined(values.customer.mobileNumber),
      address: blankToUndefined(values.customer.address),
    },
    items: [values.item],
    taxRate: values.taxRate,
    discount: values.discount,
  }
}

/** Pre-fills the form when editing an existing invoice. */
export function toFormValues(invoice: InvoiceDetail): InvoiceFormInput {
  const [item] = invoice.items
  return {
    customer: {
      fullname: invoice.customer.fullname,
      email: invoice.customer.email,
      mobileNumber: invoice.customer.mobileNumber ?? '',
      address: invoice.customer.address ?? '',
    },
    invoiceNumber: invoice.invoiceNumber,
    invoiceReference: invoice.invoiceReference ?? '',
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency as Currency,
    description: invoice.description ?? '',
    item: { name: item?.name ?? '', quantity: item?.quantity ?? 1, rate: item?.rate ?? '' },
    taxRate: invoice.taxRate,
    discount: invoice.totalDiscount,
  }
}
