# Firebase Push Notifications — Remaining Setup Steps

## ✅ Completed (All Automated + Manual Steps Done)

| Step | Status |
|------|--------|
| All code changes (backend, Flutter, Android) | ✅ Done |
| `firebase-admin` installed in Lambda layer | ✅ Done |
| Flutter Firebase packages installed | ✅ Done |
| `fcm_tokens` database migration applied | ✅ Done (migration 069 applied successfully) |
| Android app registered in Firebase | ✅ Done (JedMee Android, `com.jedmee.jedmee_mobile`) |
| iOS app registered in Firebase | ✅ Done (JedMee iOS, `com.jedmee.jedmeeMobile`) |
| FCM API V1 enabled | ✅ Done (Sender ID: 4187530182) |

---

## 🔴 Remaining Steps (Manual — Requires Your Accounts)

### Step 1 — Upload APNs Key to Firebase (iOS push notifications)

You are on the Firebase Cloud Messaging page. You can see two **Upload** buttons under "APNs Authentication Key".

**First, get the APNs key from Apple Developer:**

1. Sign in at https://developer.apple.com/account (you have the sign-in page open)
2. Go to https://developer.apple.com/account/resources/authkeys/list
3. Click **+** to create a new key
4. Key name: `JedMee APNs`
5. Check ✅ **Apple Push Notifications service (APNs)**
6. Click **Continue** → **Register**
7. Click **Download** — save the `.p8` file (only downloadable once!)
8. Note the **Key ID** shown on the page (10 characters, e.g. `ABC123DEF4`)
9. Note your **Team ID** — go to https://developer.apple.com/account → top right corner (10 characters, e.g. `ABCD123456`)

**Then upload to Firebase (on the Cloud Messaging page you have open):**

1. Under **APNs Authentication Key** → click **Upload** next to "No development APNs auth key"
2. Select the `.p8` file
3. Enter your **Key ID**
4. Enter your **Team ID**
5. Click **Upload**
6. Repeat for "No production APNs auth key" using the same `.p8` file, Key ID, and Team ID

---

### Step 2 — Get Backend Service Account Credentials

1. Go to https://console.firebase.google.com/project/jedmee-43862/settings/serviceaccounts
2. Click **Generate new private key** → **Generate key**
3. A JSON file downloads — open it in a text editor
4. Copy these values:
   - `project_id` → `jedmee-43862`
   - `client_email` → looks like `firebase-adminsdk-xxxxx@jedmee-43862.iam.gserviceaccount.com`
   - `private_key` → long string starting with `-----BEGIN RSA PRIVATE KEY-----`

---

### Step 3 — Set Backend Environment Variables

Create or edit `backend/.env`:

```
FIREBASE_PROJECT_ID=jedmee-43862
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@jedmee-43862.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END RSA PRIVATE KEY-----\n"
```

> **Important:** Replace every real newline in the private key with `\n`. The whole key goes on one line inside the quotes.

For **AWS Lambda**: add the same 3 variables in Lambda → Configuration → Environment variables.

---

### Step 4 — Add iOS Capabilities in Xcode (for iOS push on real devices)

1. Open `mobile/ios/Runner.xcworkspace` in Xcode
2. Click **Runner** (blue project icon at top of left panel)
3. Select **Runner** target → **Signing & Capabilities** tab
4. Click **+ Capability** → search **Push Notifications** → double-click to add
5. Click **+ Capability** → search **Background Modes** → double-click to add
6. In Background Modes, check ✅ **Remote notifications**

---

### Step 5 — Download and Replace Config Files

**Android** (if not done yet):
1. Go to https://console.firebase.google.com/project/jedmee-43862/settings/general/android:com.jedmee.jedmee_mobile
2. Click **google-services.json** download button
3. Replace `mobile/android/app/google-services.json`

**iOS** (if not done yet):
1. Go to https://console.firebase.google.com/project/jedmee-43862/settings/general/ios:com.jedmee.jedmeeMobile
2. Click **GoogleService-Info.plist** download button
3. Replace `mobile/ios/GoogleService-Info.plist`
4. Add it in Xcode: right-click Runner folder → Add Files → select the file → check "Copy items if needed" → Add

---

### Step 6 — Build and Run the App

```bash
cd /home/ig-008/Documents/MY/JedMee-user/mobile

# Android (connect Android device or start emulator first)
flutter run

# Build release APK
flutter build apk --release
```

> iOS push notifications only work on a real device, not the simulator.

---

## Summary of IDs

| Item | Value |
|------|-------|
| Firebase Project ID | `jedmee-43862` |
| Project Number / Sender ID | `4187530182` |
| Android package name | `com.jedmee.jedmee_mobile` |
| iOS bundle ID | `com.jedmee.jedmeeMobile` |
| Android App ID | `1:4187530182:android:5946725d605a30863ac8c7` |
| Android SHA-1 (debug) | `74:58:B5:0F:57:3C:FF:DF:F4:D4:F5:C0:FA:32:2C:98:69:85:45:F7` |

---

## How to Test After Setup

### Test from Firebase Console
1. Go to https://console.firebase.google.com/project/jedmee-43862/messaging
2. Click **Send your first message**
3. Title: `Test`, Body: `Hello from Firebase`
4. Target: your app → **Review** → **Publish**

### Test via Backend API
```bash
curl -X POST https://YOUR_API_URL/notifications/broadcast \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "body": "Push notification test", "audience": "all"}'
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No notifications on Android | Re-download `google-services.json` and replace `mobile/android/app/google-services.json` |
| No notifications on iOS | Upload APNs key to Firebase (Step 1) and add Xcode capabilities (Step 4) |
| `[FCM] Firebase env vars not set` in backend logs | Set the 3 `FIREBASE_*` env vars (Step 3) |
| Token not saved to backend | Check env vars are set — migration already applied ✅ |
| Notification tap does nothing | Check `actionPath` is set in notification payload |
| Invalid token errors in logs | Normal — backend removes them automatically |