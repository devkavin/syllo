# Circle referral integration handoff

Syllo Circles is not implemented yet. The current reward trigger is one distinct
new account registration through an existing user's referral code or link.
That signup creates one `Referral` row, with a unique referred user ID, and awards
up to 10 helps to the referrer. At most five such signups can earn a referrer
helps in a UTC calendar month. A referred new student receives a separate 10-help
welcome bonus once. Unused earned helps carry over under the Freshman 100-help
balance cap; only the *ability to earn from five new signups* resets monthly.

When Circles is built:

1. A Circle invitation may carry the inviter's existing referral code.
2. Only a new account's first qualifying signup may invoke
   `CreditService.award_signup_referral`. Joining a Circle with an existing
   account, rejoining, changing Circles, and sending an invitation must not
   grant helps.
3. Keep the referred-user uniqueness constraint and lock the referrer while
   checking monthly rewards. Do not create a parallel Circle-specific credit
   ledger or a second award path.
4. Show Circle membership and referral rewards separately. Study participation
   must not depend on recruiting friends, and low-balance notices must not push
   invitations.
5. Before a public viral launch, add stronger signup verification and abuse
   controls for disposable accounts, self-referrals, and automated registrations.

Circle membership does not currently exist in the schema or UI. This note is
the integration contract, not a claim that Circles itself is live.
