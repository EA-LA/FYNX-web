# Advertising setup

Placements are disabled. The owner-supplied AdSense verification script now loads on public pages with all ad requests paused. See [site verification](adsense-verification.md) for the exact behavior and deployment instructions. No placeholder publisher IDs or revenue claims are published.

1. Verify www.fynxfinanceworld.com in AdSense using the supplied publisher ID ca-pub-8416444551809049. Obtain responsive display ad-unit IDs from your own account before activating placements.
2. Complete Google's site review and payment-account setup.
3. Configure the applicable certified consent platform / AdSense Privacy & messaging, and update the site's privacy disclosure for the actual services used. Verify the messages and consent choices before enabling ads.
4. Before activation, replace the verification-only pause gate with the consent-aware serving integration and retain one script loader. The current build deliberately rejects enabled advertising. Enter the real IDs in config/advertising.json; set siteApproved and privacyAndConsentReady only after the prerequisites are completed.
5. Run npm run build and node scripts/package-static.cjs. This generates labeled responsive placements on four public editorial pages and the matching ads.txt seller record. Review mobile/desktop layout and consent behavior on the production domain. Do not click your own ads.

Account, sign-in, security and journal pages are excluded. Disabling configuration and rebuilding removes generated placements and the generated ads.txt record. Ad blocking or absent ads does not gate website features. Revenue depends on network approval and actual eligible traffic; integration alone does not generate earnings.

Official setup: https://support.google.com/adsense/answer/7584263
