import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import type { Payment, WriteOff } from '../../types/invoice'
import { formatDate, formatMoney, paymentMethodLabel, writeOffReasonLabel } from '../../utils/format'

/**
 * Received is what arrived (in its own currency, with the rate if converted);
 * Settled is what came off the invoice: received x rate + tax withheld.
 */
export function PaymentHistory({
  payments,
  writeOffs,
  currency,
}: {
  payments: Payment[]
  writeOffs: WriteOff[]
  currency: string
}) {
  const anyTax = payments.some((p) => p.taxWithheld > 0)

  return (
    <>
      <Typography variant="subtitle2" sx={{ mt: 4, mb: 1 }}>
        Payments
      </Typography>
      {payments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No payments recorded yet.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Payments">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Mode</TableCell>
                <TableCell align="right">Received</TableCell>
                {anyTax && <TableCell align="right">Tax withheld</TableCell>}
                <TableCell align="right">Settled</TableCell>
                <TableCell>Note</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(payment.paidAt)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{paymentMethodLabel(payment.method)}</TableCell>
                  <TableCell align="right">
                    {formatMoney(payment.amountReceived, payment.currency)}
                    {payment.currency !== currency && (
                      <Typography variant="caption" component="div" color="text.secondary">
                        at {payment.exchangeRate} = {formatMoney(payment.amount - payment.taxWithheld, currency)}
                      </Typography>
                    )}
                  </TableCell>
                  {anyTax && (
                    <TableCell align="right">
                      {payment.taxWithheld > 0 ? formatMoney(payment.taxWithheld, currency) : '—'}
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatMoney(payment.amount, currency)}
                  </TableCell>
                  <TableCell>{payment.note || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {writeOffs.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
            Write-offs
          </Typography>
          <TableContainer>
            <Table size="small" aria-label="Write-offs">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Reason</TableCell>
                  <TableCell>Note</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {writeOffs.map((writeOff) => (
                  <TableRow key={writeOff.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(writeOff.writtenOffAt)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {writeOffReasonLabel(writeOff.reason)}
                      {writeOff.paymentId && (
                        <Typography variant="caption" component="div" color="text.secondary">
                          left by a payment
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{writeOff.note || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatMoney(writeOff.amount, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </>
  )
}
