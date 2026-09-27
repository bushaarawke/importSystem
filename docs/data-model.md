# Data model

All data is stored as JSON documents in collections. Dates are strings in `YYYY-MM-DD` format; numbers entered in forms are stored as strings.

## `shipments` (one document per proforma)

Document id: the proforma number in lowercase with symbols replaced by `-` (for example `BSM/003460/26` becomes `bsm-003460-26`). Other collections refer to a proforma by this id (`piId`).

| Field | Meaning |
|-------|---------|
| `piNo`, `piDate` | Proforma number and date |
| `orderPlan` | Order number it was created from |
| `currency`, `origin`, `pod` | Currency, default origin, port of discharge |
| `items[]` | `desc, hs, origin, qty, unit, price, pkgs, pkgType, net, gross, cbm, container` |
| `poNo`, `poDate`, `poBank`, `poBankAddress`, `bStamp` | Baraka purchase order |
| `ciNo`, `bankPoNo`, `bankPoDate` | Commercial invoice no; bank PO no and date (invoice date is derived as bank PO date + 1 day) |
| `relationship`, `placeConsignment`, `docsText`, `notify` | Commercial invoice and packing list text |
| `twbNo`, `containers[]` | Truck waybill no; optional trucks: `no, seal, type, truck, trailer, driver, phone, license` |
| `insPolicy`, `permitNo` | Written back from the FCY workflow |
| `updatedAt` | Last save time |

Fixed vendor, buyer and bank details are defined in the code (`FIXED` in the Documents script) and are always applied, whatever is stored.

## `products`

`name, piDesc` (text written on the proforma), `hs, origin, unit, contType, unitPrice, qtyPerCont, pkgPerCont, netPerCont, grossPerCont`

## `orders`

| Field | Meaning |
|-------|---------|
| `orderNo`, `month`, `type` | Order no, plan month (`YYYY-MM`), `plan` or `additional` |
| `lines[]` | `productId, containers, qtyPerCont` (per-container quantity override) |
| `booked, bookingRef, bookedDate` | Booking |
| `cocStatus, cocNo, cocDate` | COC (`Not started`, `Applied`, `Issued`) |
| `planLoad, loadedDate` | Planned and actual loading |
| `etaDjb, ataDjb, etaEth, ataEth` | Expected and actual arrival in Djibouti and Ethiopia (empty expected dates are calculated from settings) |
| `containers[]` | `key, productId, containerNo, piId, permitId, declId` |
| `createdAt, updatedAt` | Timestamps |

## `permits`

`permitNo, bank, date` (approval date, starts the 180-day clock), `expiry, amount, currency, piNo, notes`

## `declarations`

`declNo, date, permitId, ciNo, bankName, status` (`Draft`, `Partial`, `Cleared`, `Cancelled`), `submittedDate, submissionRef, notes`

## `fcy` (one document per proforma, id = shipment id)

`piId, piNo, fcyBank, fcyReqRef, fcyReqAmount, fcyReqDate, insCompany, insReqDate, insPolicy, insPremium, insDate, fcyAppRef, fcyAppAmount, fcyAppDate, subDate, bankPoNo, bankPoDate, chamberRef, chamberDate, dhlNo, dhlSent, dhlDelivered, permitNo, permitDate, permitExpiry, permitId, linkedContainers, notes, updatedAt`

A step counts as done when its date field is filled.

## `settings`

| Document | Fields |
|----------|--------|
| `settings/company` | `bEmail, notify, bContact, bLogo, bColor, poTerms, bStamp` |
| `settings/banks` | Map of bank name to saved branch address |
| `settings/timing` | `djbDays, ethDays, cocLead, bookLead` |
| `settings/delinquency` | `days` (default 180), `warnDays` (default 30) |
| `settings/backup` | `lastAt` (time of the last backup download) |

Not used by the current version: `vendors`, `settings/nbe`.

## Browser storage

`impdoc-draft` (unsaved Documents form) and `baraka-app` (last open module).
