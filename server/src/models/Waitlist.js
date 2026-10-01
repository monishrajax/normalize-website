import { db } from "../db.js";

/* The early-access gate's one write: a name, an email, an optional phone, and
   whichever rotating question they answered. Upserted on email so filling the
   form again — another visit, another device, a typo fixed — updates one row
   instead of piling up duplicates for the same person. */
export async function upsertSignup({ name, email, phone, question, answer }) {
  const sql = db();
  const [row] = await sql`
    insert into waitlist_signups (name, email, phone, question, answer)
    values (${name}, ${email}, ${phone || ""}, ${question || ""}, ${answer || ""})
    on conflict (lower(email)) do update set
      name     = excluded.name,
      phone    = excluded.phone,
      question = excluded.question,
      answer   = excluded.answer
    returning id, created_at
  `;
  return row;
}
