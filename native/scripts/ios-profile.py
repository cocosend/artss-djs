"""Validate a development profile and generate private signing configuration."""
import datetime
import json
import os
import pathlib
import plistlib
import re

root = pathlib.Path(os.environ['SIGN_DIR'])
profile = plistlib.loads((root / 'profile.plist').read_bytes())
team = os.environ['APPLE_TEAM_ID']
if not re.fullmatch(r'[A-Z0-9]{10}', team) or team not in profile.get('TeamIdentifier', []):
    raise SystemExit('Profile does not match APPLE_TEAM_ID')
if profile['ExpirationDate'] <= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
    raise SystemExit('Provisioning profile has expired')
entitlements = profile['Entitlements']
if not entitlements.get('get-task-allow') or not profile.get('ProvisionedDevices'):
    raise SystemExit('An iOS App Development device profile is required')
app_id = entitlements['application-identifier']
if '.' not in app_id:
    raise SystemExit('Invalid application identifier')
bundle = app_id.split('.', 1)[1]
if '*' in bundle:
    raise SystemExit('Use an explicit App ID profile for this app (no wildcard)')
if not re.fullmatch(r'[A-Za-z0-9.-]+', bundle):
    raise SystemExit('Invalid bundle identifier')
settings = {'PRODUCT_BUNDLE_IDENTIFIER': bundle, 'DEVELOPMENT_TEAM': team,
            'CODE_SIGN_STYLE': 'Manual', 'CODE_SIGN_IDENTITY': 'Apple Development',
            'PROVISIONING_PROFILE_SPECIFIER': profile['UUID']}
(root / 'settings.json').write_text(json.dumps(settings))
options = {'method': 'debugging', 'teamID': team, 'signingStyle': 'manual',
           'signingCertificate': 'Apple Development',
           'provisioningProfiles': {bundle: profile['UUID']},
           'manageAppVersionAndBuildNumber': False}
(root / 'ExportOptions.plist').write_bytes(plistlib.dumps(options))
print('Development profile validated; export configuration generated')
