# Demonstration assets

The deployed system starts with an **empty case list** — nothing is seeded. Use
these files to create cases _live_ during a walkthrough rather than describing
them.

| File                           | Use it to demonstrate                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jotform-enquiry.pdf`          | Drop onto the **Add a case** form's smart-fill zone. The intake job reads the parent, child, school, SEND needs, service required and consents, and prefills the form — you review and press Create.                                                                                                                                |
| `amended-directions-order.pdf` | Drop onto a case's **Upload directions**. It vacates the 18 June hearing and relists it for 30 July, moves the evidence deadline (expressed in working days before the hearing) and sets a respondent deadline — so the review screen shows a real _moved / new / removed_ diff. Apply it and the new dates appear on the calendar. |
| `parent-email.eml`             | Drop onto a case's **Documents / Emails** tab. It is filed as a _received_ email from the parent, and its PDF attachment (her comments on the draft plan) is filed in Documents under Correspondence.                                                                                                                               |
| `tribunal-bundle.msg`          | An Outlook message _sent_ by Jamie McMullen, with a cc and a PDF attachment. Drop it on the same tab to show Outlook files work, that staff email is marked _Sent_, and — drop it a second time — that the same email is never filed twice.                                                                                         |

The PDFs are real, with extractable text. Regenerate them with:

```bash
node docs/demo/generate.mjs
```

Regenerate the emails with:

```bash
npm run demo:emails -w @re-send/api
```

## Suggested walkthrough

1. Sign in as a demo account (e.g. Ada Okafor).
2. Show the **empty** case list.
3. **Add a case** manually — a minimal enquiry.
4. **Add a second case** by dropping `jotform-enquiry.pdf` into smart fill;
   review the prefilled fields; Create.
5. Open that case, **Upload directions** (`amended-directions-order.pdf`),
   confirm the diff, and **Apply**.
6. On the same case, open **Documents / Emails** and drop `parent-email.eml`
   and `tribunal-bundle.msg` together. Open an email to read it; its
   attachment is already in Documents. Drop the .msg again — it is recognised
   as already filed.
7. Open the **Calendar** — the relisted hearing and moved deadline are there.
8. Run **Review** across both cases.
9. Reassign a case and watch it update live in a second browser window.
10. **Reset demo** (top-right) to return to a blank list and run it again.
