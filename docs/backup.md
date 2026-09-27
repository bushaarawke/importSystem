# Saving, backup and restore

## How data is saved

Every time someone clicks **Save** (or Delete), the change is written immediately to the system's database and is shared with everyone using the system. Nothing is kept only on one computer.

The only data kept in the browser is the unsaved Documents form (so a page refresh doesn't lose typing) and which part of the system was open last.

## Making a backup

Click **Backup** at the top right of the header.

| Button | File | Use |
|--------|------|-----|
| Download backup file | `baraka-backup-YYYY-MM-DD.json` | Complete copy of every record. Can be restored. |
| Download Excel copy | `baraka-records-YYYY-MM-DD.xlsx` | One sheet per record type, for reading and reports. Images are shown as `[image]`. |

The window shows the date of the last backup. An amber dot appears on the Backup button when there has been no backup for 30 days.

**Recommended routine:** once a month, and before any big change, download the backup file and keep it in two places (for example the office computer and a USB drive or company email).

## Restoring

1. Click **Backup**, then under *Restore from a backup* choose a `.json` backup file.
2. Check the summary (how many records of each type are in the file).
3. Click **Restore**, then click again to confirm.

Records in the file replace records with the same id. Records that are not in the file are left as they are, so restoring never deletes anything.

## Backup file format

```json
{
  "app": "baraka-import-system",
  "version": 1,
  "exportedAt": "2026-09-25T09:30:00.000Z",
  "collections": {
    "orders": { "<id>": { ... } },
    "products": { ... },
    "shipments": { ... },
    "fcy": { ... },
    "permits": { ... },
    "declarations": { ... },
    "settings": { ... },
    "vendors": { ... }
  }
}
```

The same file can be used to move the data to another server (for example Firebase): each collection and document id is kept, so the links between records still work.
