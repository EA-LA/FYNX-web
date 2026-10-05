# Advertising setup

Prepared but disabled. No ads, ad trackers, placeholder publisher IDs or revenue claims are published.

1. Apply for AdSense for www.fynxfinanceworld.com. Obtain the public publisher ID and responsive display ad-unit ID from your own account. For site verification use the meta tag supplied by AdSense; do not invent an ID.
2. Complete Google's site review and payment-account setup.
3. Configure the applicable certified consent platform / AdSense Privacy & messaging, and update the site's privacy disclosure for the actual services used. Verify the messages and consent choices before enabling ads.
4. Enter the real IDs in config/advertising.json. Set siteApproved and privacyAndConsentReady only after those steps are completed, then enabled to true.
5. Run npm run build and node scripts/package-static.cjs. This generates labeled responsive placements on four public editorial pages and the matching ads.txt seller record. Review mobile/desktop layout and consent behavior on the production domain. Do not click your own ads.

Account, sign-in, security and journal pages are excluded. Disabling configuration and rebuilding removes generated placements and the generated ads.txt record. Ad blocking or absent ads does not gate website features. Revenue depends on network approval and actual eligible traffic; integration alone does not generate earnings.

Official setup: https://support.google.com/adsense/answer/7584263
