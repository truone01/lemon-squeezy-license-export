# Lemon Squeezy license keys: export them, and keep them working after March 31, 2027

Lemon Squeezy is winding down. It stops processing payments on **March 31, 2027**, and its official path, Stripe Managed Payments, "doesn't deliver files, license keys, or download links" ([Lemon Squeezy migration docs](https://docs.lemonsqueezy.com/migration)).

If your desktop app, plugin, CLI or extension calls Lemon Squeezy's License API (`/v1/licenses/activate`, `/validate`, `/deactivate`), those calls stop working when Lemon Squeezy does. Paying customers get locked out, or your app fails open. Every copy you've shipped needs to point somewhere else **before** that date, and users update slowly, so the change has to ship months early.

This repo has two things:

1. **`ls-license-export.mjs`**: a dependency-free script that exports every license key *and every device activation* to one CSV. Run it first, whatever you decide next.
2. **A checklist** and an honest comparison of your options.

## 1. Export your keys and activations

```sh
# Node 18+. Create a key in Lemon Squeezy: Settings -> API -> +. Delete it afterwards.
LEMONSQUEEZY_API_KEY=your_key node ls-license-export.mjs > licenses.csv
```

You get one row per activation (and one row for each key without any). Columns:
`license_key_id, license_key, status, activation_limit, activations, expires_at, created_at, customer_name, customer_email, store_id, product_id, order_id, order_item_id, instance_id, instance_name, instance_created_at`

`instance_id` is the value your app got back from `activate` and sends on every `validate`. Keep it. A new license server can honour existing activations only if it has these IDs; without them, every customer has to activate again.

The file contains customer names and emails. Keep it private.

Prefer not to run a script? The same export runs in the browser at <https://licensehandoff.2-29-18-178.sslip.io/export-lemon-squeezy-license-keys>. The key is used once and not stored.

## 2. Checklist

- [ ] Find every place your app calls `api.lemonsqueezy.com/v1/licenses/*`, including old versions still in use.
- [ ] Export keys + activations (above). Re-export just before you switch.
- [ ] Choose where license checks will live (options below).
- [ ] Decide how new purchases get keys after you move checkout (e.g. a Stripe webhook that issues them).
- [ ] Ship an app update that points license checks at the new server, **with a grace period**, so a network error never locks out a paying user.
- [ ] Keep the update window in mind: versions that still call Lemon Squeezy stop validating on March 31, 2027.

## 3. Options

| Option | Keeps existing keys | Keeps activations (no re-activate) | App code change | Payments |
|---|---|---|---|---|
| Stripe Managed Payments alone | No license keys at all | No | n/a | Stripe |
| [Dodo Payments](https://docs.dodopayments.com/features/license-keys) migration CLI | Yes (imports LS keys) | Not stated by Dodo; check | Move to Dodo's license API | Must move to Dodo |
| [Polar](https://polar.sh) | Has license keys; check whether it imports yours | Check | Move to Polar's API | Must move to Polar |
| [Keygen](https://keygen.sh), [Keylight](https://keylight.dev), [LicenseSeat](https://licenseseat.com), [LicenseLatte](https://licenselatte.com) | Usually via import | Varies | Adopt their SDK/API | Any |
| Self-host | Yes, from the CSV | Yes, from the CSV | Your own endpoints | Any |
| [LicenseHandoff](https://licensehandoff.2-29-18-178.sslip.io/?ref=github) (**waitlist, not available yet**) | Yes | Yes (imports instances) | Change the base URL only (same requests and response shapes as LS) | Any, incl. Stripe Managed Payments |

Check each vendor's current docs; this table reflects what they published as of November 2026.

## More detail

- [Lemon Squeezy shutdown: keeping license keys working](https://licensehandoff.2-29-18-178.sslip.io/guides/lemon-squeezy-shutdown-license-keys)
- [The Lemon Squeezy License API: what a replacement must keep](https://licensehandoff.2-29-18-178.sslip.io/guides/lemon-squeezy-license-api)
- [Moving to Stripe: license keys don't come with you](https://licensehandoff.2-29-18-178.sslip.io/guides/lemon-squeezy-to-stripe-license-keys)
- [WordPress plugins and themes: license checks and updates](https://licensehandoff.2-29-18-178.sslip.io/guides/lemon-squeezy-wordpress-plugin-license-updates)

## About

Maintained by [LicenseHandoff](https://licensehandoff.2-29-18-178.sslip.io/?ref=github). Not affiliated with Lemon Squeezy or Stripe. Corrections welcome via issues.

Script licence: MIT (see `LICENSE`).
