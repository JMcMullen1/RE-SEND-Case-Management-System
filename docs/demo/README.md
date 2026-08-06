# Demonstration assets

The deployed system starts with an **empty case list** — nothing is seeded. Use
these files to create cases _live_ during a walkthrough rather than describing
them.

| File                           | Use it to demonstrate                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jotform-enquiry.pdf`          | Drop onto the **Add a case** form's smart-fill zone. The intake job reads the parent, child, school, SEND needs, service required and consents, and prefills the form — you review and press Create.                                                                                                                                |
| `amended-directions-order.pdf` | Drop onto a case's **Upload directions**. It vacates the 18 June hearing and relists it for 30 July, moves the evidence deadline (expressed in working days before the hearing) and sets a respondent deadline — so the review screen shows a real _moved / new / removed_ diff. Apply it and the new dates appear on the calendar. |

Both are real PDFs with extractable text. Regenerate them with:

```bash
node docs/demo/generate.mjs
```

## Suggested walkthrough

1. Sign in as a demo account (e.g. Ada Okafor).
2. Show the **empty** case list.
3. **Add a case** manually — a minimal enquiry.
4. **Add a second case** by dropping `jotform-enquiry.pdf` into smart fill;
   review the prefilled fields; Create.
5. Open that case, **Upload directions** (`amended-directions-order.pdf`),
   confirm the diff, and **Apply**.
6. Open the **Calendar** — the relisted hearing and moved deadline are there.
7. Run **Review** across both cases.
8. Reassign a case and watch it update live in a second browser window.
9. **Reset demo** (top-right) to return to a blank list and run it again.
