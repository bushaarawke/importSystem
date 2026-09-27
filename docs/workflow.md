# Business rules

## Order plan

- New orders get the next number in the series automatically (0001, 0002…, or following an existing prefix such as OP-2026-0015). A number that is already used is refused.
- Container counts are kept exactly as entered, including fractions.
- An order moves through: Planned, Booked, COC issued, Loaded, At Djibouti, Arrived Ethiopia. The status is derived from the dates entered.
- Containers cannot be marked as loaded until the COC is issued.
- Expected dates, when left empty: loading + 30 days to Djibouti, then + 7 days to Ethiopia (editable in Settings).
- Warnings: COC not issued within 10 days of loading; not booked within 21 days of loading; containers without a proforma (once booked), without a bank permit (once booked), or without a declaration (once loaded).
- A declaration can only be linked to containers under the same bank permit.

## Documents

- Fixed on every document: vendor Central Hub FZCO (letterhead, address, bank details), buyer Baraka Solar Manufacturing PLC (TIN 0088316694), proforma validity 90 days, payment CAD, partial shipment allowed, delivery terms FCA, shipment by truck from Djibouti, final destination Ethiopia.
- The Central Hub stamp prints on the proforma only.
- Commercial invoice date = bank PO date + 1 day. The packing list and truck waybill use the commercial invoice date.
- Totals, amounts in words and weights are calculated automatically.
- The proforma quantity is checked against the linked containers in the order plan.

## FCY & bank permit

Nine steps, which must be completed in order:

1. FCY requested
2. Insurance requested
3. Insurance policy issued
4. FCY approved (requires the insurance policy no)
5. Proforma and PO submitted to the bank (requires the PO to exist)
6. PO approved by the bank (bank PO no and date copied to the commercial invoice)
7. Chamber documents created
8. Sent to vendor by DHL (tracking link)
9. Bank permit issued (creates the permit and links it to the proforma's containers)

Waiting time is shown grey up to 14 days, amber after 14, red after 30.

## Declarations & delinquency

- Required: declaration no, bank permit, commercial invoice no, bank name.
- Deadline = bank permit approval date + 180 days. The bank permit, commercial invoice and declaration must be submitted by then.
- Status: Pending (more than 30 days left), Due soon (30 days or less), Delinquent (deadline passed, not submitted), Submitted (on time or late).

## Deleting

- Deleting takes two clicks. Deleting a proforma unlinks its containers and removes its FCY workflow; deleting a declaration unlinks it from its containers.
- A product used in an order, or a bank permit still linked to containers or declarations, cannot be deleted until it is unlinked.
