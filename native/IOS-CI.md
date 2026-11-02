# iOS builds on GitHub Actions

Workflow: `.github/workflows/ios.yml`. Pull requests and main pushes build an unsigned device archive and `ARTSS-UNSIGNED.ipa`. This file needs signing before installation.

After the workflow reaches main, Actions → iOS IPA → Run workflow with `signed=true` exports a development-signed IPA. Add these repository Actions secrets first:

- `APPLE_TEAM_ID`: team in the provisioning profile.
- `APPLE_CERT_P12`: Base64 of the existing P12 including its private key.
- `APPLE_CERT_PASSWORD`: P12 export password.
- `APPLE_PROVISION_PROFILE`: Base64 of an unexpired explicit iOS App Development profile, matching the certificate and including the target iPhone.

Use Settings → Secrets and variables → Actions. Never commit the P12, its Base64, password or profile. Base64 is encoding, not encryption. Keep private-key creation local; do not use an online CSR generator that retains the key.

The app bundle identifier and ExportOptions.plist are derived from the supplied profile. Temporary certificate/keychain material is deleted even on failure. Signing secrets are only passed on an explicitly signed manual run, never on pull requests. Download the IPA from the successful run's ARTSS-iOS artifact. This is device development distribution, not TestFlight/App Store publication.

Native Xcode compilation and signed export are only confirmed after their Actions job succeeds. Missing secrets do not block unsigned compilation. This setup does not purchase CI minutes or Apple membership.
